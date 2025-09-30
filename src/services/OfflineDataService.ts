import AsyncStorage from '@react-native-async-storage/async-storage';
import { DatabaseService } from '../database/DatabaseService';
import { RunData, Split, TrackPoint, AppSettings, EmergencyContact } from '../models/types';
import { ErrorHandlingService, ErrorType } from './ErrorHandlingService';

export interface PendingOperation {
  id: string;
  type: 'create_run' | 'update_run' | 'add_track_point' | 'add_split' | 'update_settings' | 'emergency_contact';
  data: any;
  timestamp: Date;
  retryCount: number;
  maxRetries: number;
}

export interface BackupData {
  runs: RunData[];
  settings: AppSettings;
  emergencyContacts: EmergencyContact[];
  timestamp: Date;
  version: string;
}

export interface SyncStatus {
  isOnline: boolean;
  lastSyncTime: Date | null;
  pendingOperations: number;
  lastBackupTime: Date | null;
}

export class OfflineDataService {
  private static instance: OfflineDataService | null = null;
  private databaseService: DatabaseService | null = null;
  private errorHandler: ErrorHandlingService;
  private pendingOperations: PendingOperation[] = [];
  private syncInterval: NodeJS.Timeout | null = null;
  private backupInterval: NodeJS.Timeout | null = null;
  private isOnline = true;
  private lastSyncTime: Date | null = null;
  private lastBackupTime: Date | null = null;

  private readonly PENDING_OPERATIONS_KEY = 'pending_operations';
  private readonly BACKUP_DATA_KEY = 'backup_data';
  private readonly SYNC_STATUS_KEY = 'sync_status';
  private readonly BACKUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
  private readonly SYNC_INTERVAL_MS = 30 * 1000; // 30 seconds

  private constructor() {
    this.errorHandler = ErrorHandlingService.getInstance();
    this.initializeService();
  }

  static getInstance(): OfflineDataService {
    if (!OfflineDataService.instance) {
      OfflineDataService.instance = new OfflineDataService();
    }
    return OfflineDataService.instance;
  }

  private async initializeService(): Promise<void> {
    try {
      // Initialize database service
      this.databaseService = await DatabaseService.getInstance();
      
      // Load pending operations from storage
      await this.loadPendingOperations();
      
      // Load sync status
      await this.loadSyncStatus();
      
      // Start periodic backup
      this.startPeriodicBackup();
      
      // Start sync process if online
      if (this.isOnline) {
        this.startPeriodicSync();
      }
      
      console.log('OfflineDataService initialized');
    } catch (error) {
      console.error('Failed to initialize OfflineDataService:', error);
      await this.errorHandler.reportDatabaseError(error as Error, this.databaseService);
    }
  }

  // Offline operation queueing
  async queueOperation(type: PendingOperation['type'], data: any): Promise<void> {
    const operation: PendingOperation = {
      id: `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      data,
      timestamp: new Date(),
      retryCount: 0,
      maxRetries: 3
    };

    this.pendingOperations.push(operation);
    await this.savePendingOperations();

    // Try to execute immediately if online
    if (this.isOnline) {
      await this.processPendingOperations();
    }
  }

  // Execute operations when back online
  private async processPendingOperations(): Promise<void> {
    if (!this.databaseService || this.pendingOperations.length === 0) {
      return;
    }

    const operationsToProcess = [...this.pendingOperations];
    const failedOperations: PendingOperation[] = [];

    for (const operation of operationsToProcess) {
      try {
        await this.executeOperation(operation);
        
        // Remove successful operation
        this.pendingOperations = this.pendingOperations.filter(op => op.id !== operation.id);
        
        console.log(`Successfully processed operation: ${operation.type}`);
      } catch (error) {
        console.error(`Failed to process operation ${operation.type}:`, error);
        
        operation.retryCount++;
        
        if (operation.retryCount >= operation.maxRetries) {
          // Remove failed operation after max retries
          this.pendingOperations = this.pendingOperations.filter(op => op.id !== operation.id);
          console.error(`Operation ${operation.type} failed after ${operation.maxRetries} retries`);
        } else {
          failedOperations.push(operation);
        }
      }
    }

    // Save updated pending operations
    await this.savePendingOperations();
    this.lastSyncTime = new Date();
    await this.saveSyncStatus();
  }

  private async executeOperation(operation: PendingOperation): Promise<void> {
    if (!this.databaseService) {
      throw new Error('Database service not available');
    }

    switch (operation.type) {
      case 'create_run':
        await this.databaseService.createRun(new Date(operation.data.startTime));
        break;
        
      case 'update_run':
        await this.databaseService.updateRun(operation.data.id, operation.data.updates);
        break;
        
      case 'add_track_point':
        await this.databaseService.addTrackPoint(operation.data);
        break;
        
      case 'add_split':
        await this.databaseService.addSplit(operation.data);
        break;
        
      case 'update_settings':
        await this.databaseService.updateSettings(operation.data);
        break;
        
      case 'emergency_contact':
        if (operation.data.action === 'add') {
          await this.databaseService.addEmergencyContact(operation.data.contact);
        } else if (operation.data.action === 'update') {
          await this.databaseService.updateEmergencyContact(operation.data.id, operation.data.contact);
        } else if (operation.data.action === 'delete') {
          await this.databaseService.deleteEmergencyContact(operation.data.id);
        }
        break;
        
      default:
        throw new Error(`Unknown operation type: ${operation.type}`);
    }
  }

  // Data backup functionality
  async createBackup(): Promise<void> {
    try {
      if (!this.databaseService) {
        throw new Error('Database service not available');
      }

      const runs = await this.databaseService.getAllRuns();
      const settings = await this.databaseService.getSettings();
      const emergencyContacts = await this.databaseService.getEmergencyContacts();

      // Load splits and track points for each run
      for (const run of runs) {
        run.splits = await this.databaseService.getSplits(run.id);
        run.trackPoints = await this.databaseService.getTrackPoints(run.id);
      }

      const backupData: BackupData = {
        runs,
        settings,
        emergencyContacts,
        timestamp: new Date(),
        version: '1.0.0'
      };

      await AsyncStorage.setItem(this.BACKUP_DATA_KEY, JSON.stringify(backupData));
      this.lastBackupTime = new Date();
      await this.saveSyncStatus();

      console.log('Backup created successfully');
    } catch (error) {
      console.error('Failed to create backup:', error);
      await this.errorHandler.reportDatabaseError(error as Error, this.databaseService);
    }
  }

  async restoreFromBackup(): Promise<boolean> {
    try {
      const backupDataString = await AsyncStorage.getItem(this.BACKUP_DATA_KEY);
      if (!backupDataString) {
        console.log('No backup data found');
        return false;
      }

      const backupData: BackupData = JSON.parse(backupDataString);
      
      if (!this.databaseService) {
        throw new Error('Database service not available');
      }

      // Restore settings
      await this.databaseService.updateSettings(backupData.settings);

      // Restore emergency contacts
      await this.databaseService.clearEmergencyContacts();
      for (const contact of backupData.emergencyContacts) {
        await this.databaseService.addEmergencyContact({
          name: contact.name,
          phoneNumber: contact.phoneNumber,
          isPrimary: contact.isPrimary
        });
      }

      // Note: Run data restoration would be more complex in a real scenario
      // as it might conflict with existing data. For now, we'll just log it.
      console.log(`Backup contains ${backupData.runs.length} runs`);
      console.log('Backup restored successfully (settings and contacts only)');
      
      return true;
    } catch (error) {
      console.error('Failed to restore from backup:', error);
      await this.errorHandler.reportDatabaseError(error as Error, this.databaseService);
      return false;
    }
  }

  async exportBackupData(): Promise<string> {
    try {
      const backupDataString = await AsyncStorage.getItem(this.BACKUP_DATA_KEY);
      if (!backupDataString) {
        throw new Error('No backup data available');
      }
      return backupDataString;
    } catch (error) {
      console.error('Failed to export backup data:', error);
      throw error;
    }
  }

  async importBackupData(backupDataString: string): Promise<boolean> {
    try {
      const backupData: BackupData = JSON.parse(backupDataString);
      
      // Validate backup data structure
      if (!backupData.runs || !backupData.settings || !backupData.emergencyContacts) {
        throw new Error('Invalid backup data format');
      }

      await AsyncStorage.setItem(this.BACKUP_DATA_KEY, backupDataString);
      return await this.restoreFromBackup();
    } catch (error) {
      console.error('Failed to import backup data:', error);
      return false;
    }
  }

  // Network status management
  setOnlineStatus(isOnline: boolean): void {
    const wasOffline = !this.isOnline;
    this.isOnline = isOnline;

    if (isOnline && wasOffline) {
      console.log('Back online - processing pending operations');
      this.processPendingOperations();
      this.startPeriodicSync();
    } else if (!isOnline) {
      console.log('Gone offline - queueing operations');
      this.stopPeriodicSync();
    }
  }

  // Periodic operations
  private startPeriodicBackup(): void {
    if (this.backupInterval) {
      clearInterval(this.backupInterval);
    }

    this.backupInterval = setInterval(() => {
      this.createBackup();
    }, this.BACKUP_INTERVAL_MS);
  }

  private startPeriodicSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }

    this.syncInterval = setInterval(() => {
      this.processPendingOperations();
    }, this.SYNC_INTERVAL_MS);
  }

  private stopPeriodicSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  // Storage operations
  private async loadPendingOperations(): Promise<void> {
    try {
      const operationsString = await AsyncStorage.getItem(this.PENDING_OPERATIONS_KEY);
      if (operationsString) {
        this.pendingOperations = JSON.parse(operationsString);
        // Convert timestamp strings back to Date objects
        this.pendingOperations.forEach(op => {
          op.timestamp = new Date(op.timestamp);
        });
      }
    } catch (error) {
      console.error('Failed to load pending operations:', error);
      this.pendingOperations = [];
    }
  }

  private async savePendingOperations(): Promise<void> {
    try {
      await AsyncStorage.setItem(this.PENDING_OPERATIONS_KEY, JSON.stringify(this.pendingOperations));
    } catch (error) {
      console.error('Failed to save pending operations:', error);
    }
  }

  private async loadSyncStatus(): Promise<void> {
    try {
      const statusString = await AsyncStorage.getItem(this.SYNC_STATUS_KEY);
      if (statusString) {
        const status = JSON.parse(statusString);
        this.lastSyncTime = status.lastSyncTime ? new Date(status.lastSyncTime) : null;
        this.lastBackupTime = status.lastBackupTime ? new Date(status.lastBackupTime) : null;
        this.isOnline = status.isOnline !== undefined ? status.isOnline : true;
      }
    } catch (error) {
      console.error('Failed to load sync status:', error);
    }
  }

  private async saveSyncStatus(): Promise<void> {
    try {
      const status: SyncStatus = {
        isOnline: this.isOnline,
        lastSyncTime: this.lastSyncTime,
        pendingOperations: this.pendingOperations.length,
        lastBackupTime: this.lastBackupTime
      };
      await AsyncStorage.setItem(this.SYNC_STATUS_KEY, JSON.stringify(status));
    } catch (error) {
      console.error('Failed to save sync status:', error);
    }
  }

  // Public status methods
  getSyncStatus(): SyncStatus {
    return {
      isOnline: this.isOnline,
      lastSyncTime: this.lastSyncTime,
      pendingOperations: this.pendingOperations.length,
      lastBackupTime: this.lastBackupTime
    };
  }

  getPendingOperationsCount(): number {
    return this.pendingOperations.length;
  }

  getLastBackupTime(): Date | null {
    return this.lastBackupTime;
  }

  // Storage management
  async getStorageUsage(): Promise<{ used: number; available: number; total: number }> {
    try {
      // This is a simplified implementation
      // In a real app, you'd use a native module to get actual storage info
      const backupData = await AsyncStorage.getItem(this.BACKUP_DATA_KEY);
      const pendingOps = await AsyncStorage.getItem(this.PENDING_OPERATIONS_KEY);
      
      const usedBytes = (backupData?.length || 0) + (pendingOps?.length || 0);
      
      // Estimate based on typical mobile storage
      const totalBytes = 64 * 1024 * 1024 * 1024; // 64GB estimate
      const availableBytes = totalBytes - usedBytes;
      
      return {
        used: usedBytes,
        available: availableBytes,
        total: totalBytes
      };
    } catch (error) {
      console.error('Failed to get storage usage:', error);
      return { used: 0, available: 0, total: 0 };
    }
  }

  async cleanupOldData(daysToKeep: number = 30): Promise<void> {
    try {
      if (!this.databaseService) {
        throw new Error('Database service not available');
      }

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      // This would require additional database methods to delete old runs
      // For now, we'll just log the cleanup action
      console.log(`Cleanup requested for data older than ${cutoffDate.toISOString()}`);
      
      // Clean up old pending operations
      this.pendingOperations = this.pendingOperations.filter(
        op => op.timestamp >= cutoffDate
      );
      await this.savePendingOperations();
      
    } catch (error) {
      console.error('Failed to cleanup old data:', error);
      await this.errorHandler.reportDatabaseError(error as Error, this.databaseService);
    }
  }

  // Cleanup method
  cleanup(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
    
    if (this.backupInterval) {
      clearInterval(this.backupInterval);
      this.backupInterval = null;
    }
  }
}