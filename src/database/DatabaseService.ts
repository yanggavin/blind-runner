import * as SQLite from 'expo-sqlite';
import { initializeDatabase, getDatabase } from './index';
import { RunData, Split, TrackPoint, AppSettings, EmergencyContact } from '../models/types';
import { ErrorHandlingService, ErrorType } from '../services/ErrorHandlingService';

export class DatabaseService {
  private static instance: DatabaseService | null = null;
  private db: SQLite.SQLiteDatabase | null = null;
  private errorHandler: ErrorHandlingService;
  private initializationPromise: Promise<void> | null = null;

  private constructor() {
    this.errorHandler = ErrorHandlingService.getInstance();
  }

  static async getInstance(): Promise<DatabaseService> {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    
    // Ensure initialization is complete
    if (!DatabaseService.instance.initializationPromise) {
      DatabaseService.instance.initializationPromise = DatabaseService.instance.initialize();
    }
    
    await DatabaseService.instance.initializationPromise;
    return DatabaseService.instance;
  }

  async initialize(): Promise<void> {
    try {
      this.db = await initializeDatabase();
      console.log('Database initialized successfully');
    } catch (error) {
      console.error('Database initialization failed:', error);
      await this.errorHandler.reportDatabaseError(error as Error, this);
      throw error;
    }
  }

  private async getDb(): Promise<SQLite.SQLiteDatabase> {
    if (!this.db) {
      // Attempt to reinitialize if database is not available
      try {
        await this.initialize();
      } catch (error) {
        await this.errorHandler.reportDatabaseError(error as Error, this);
        throw new Error('Database not available');
      }
    }
    
    if (!this.db) {
      throw new Error('Database initialization failed');
    }
    
    return this.db;
  }

  private async executeWithErrorHandling<T>(
    operation: () => Promise<T>,
    operationName: string
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      console.error(`Database operation failed: ${operationName}`, error);
      await this.errorHandler.reportDatabaseError(error as Error, this);
      throw error;
    }
  }

  // Run operations
  async createRun(startTime: Date): Promise<number> {
    return this.executeWithErrorHandling(async () => {
      const db = await this.getDb();
      const result = await db.runAsync(
        'INSERT INTO runs (start_time, status) VALUES (?, ?)',
        [startTime.toISOString(), 'active']
      );
      return result.lastInsertRowId;
    }, 'createRun');
  }

  async updateRun(id: number, data: Partial<RunData>): Promise<void> {
    return this.executeWithErrorHandling(async () => {
      const db = await this.getDb();
      const fields: string[] = [];
      const values: any[] = [];

      if (data.endTime !== undefined) {
        fields.push('end_time = ?');
        values.push(data.endTime.toISOString());
      }
      if (data.totalDistance !== undefined) {
        fields.push('total_distance = ?');
        values.push(data.totalDistance);
      }
      if (data.totalDuration !== undefined) {
        fields.push('total_duration = ?');
        values.push(data.totalDuration);
      }
      if (data.averagePace !== undefined) {
        fields.push('average_pace = ?');
        values.push(data.averagePace);
      }
      if (data.status !== undefined) {
        fields.push('status = ?');
        values.push(data.status);
      }

      if (fields.length > 0) {
        fields.push('updated_at = ?');
        values.push(new Date().toISOString());
        values.push(id);

        await db.runAsync(
          `UPDATE runs SET ${fields.join(', ')} WHERE id = ?`,
          values
        );
      }
    }, 'updateRun');
  }

  async getRun(id: number): Promise<RunData | null> {
    const db = this.getDb();
    const run = await db.getFirstAsync(
      'SELECT * FROM runs WHERE id = ?',
      [id]
    ) as any;

    if (!run) {
      return null;
    }

    return {
      id: run.id,
      startTime: new Date(run.start_time),
      endTime: run.end_time ? new Date(run.end_time) : undefined,
      totalDistance: run.total_distance,
      totalDuration: run.total_duration,
      averagePace: run.average_pace,
      status: run.status,
      splits: [],
      trackPoints: []
    };
  }

  async getActiveRun(): Promise<RunData | null> {
    const db = this.getDb();
    const run = await db.getFirstAsync(
      'SELECT * FROM runs WHERE status IN (?, ?) ORDER BY start_time DESC LIMIT 1',
      ['active', 'paused']
    ) as any;

    if (!run) {
      return null;
    }

    return {
      id: run.id,
      startTime: new Date(run.start_time),
      endTime: run.end_time ? new Date(run.end_time) : undefined,
      totalDistance: run.total_distance,
      totalDuration: run.total_duration,
      averagePace: run.average_pace,
      status: run.status,
      splits: [],
      trackPoints: []
    };
  }

  async getAllRuns(): Promise<RunData[]> {
    const db = this.getDb();
    const runs = await db.getAllAsync(
      'SELECT * FROM runs ORDER BY start_time DESC'
    ) as any[];

    return runs.map(run => ({
      id: run.id,
      startTime: new Date(run.start_time),
      endTime: run.end_time ? new Date(run.end_time) : undefined,
      totalDistance: run.total_distance,
      totalDuration: run.total_duration,
      averagePace: run.average_pace,
      status: run.status,
      splits: [],
      trackPoints: []
    }));
  }

  // Track point operations
  async addTrackPoint(trackPoint: Omit<TrackPoint, 'id'>): Promise<number> {
    const db = this.getDb();
    const result = await db.runAsync(
      `INSERT INTO track_points (run_id, latitude, longitude, altitude, accuracy, speed, timestamp) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        trackPoint.runId,
        trackPoint.latitude,
        trackPoint.longitude,
        trackPoint.altitude,
        trackPoint.accuracy,
        trackPoint.speed,
        trackPoint.timestamp.toISOString()
      ]
    );
    return result.lastInsertRowId;
  }

  async getTrackPoints(runId: number): Promise<TrackPoint[]> {
    const db = this.getDb();
    const points = await db.getAllAsync(
      'SELECT * FROM track_points WHERE run_id = ? ORDER BY timestamp',
      [runId]
    ) as any[];

    return points.map(point => ({
      id: point.id,
      runId: point.run_id,
      latitude: point.latitude,
      longitude: point.longitude,
      altitude: point.altitude,
      accuracy: point.accuracy,
      speed: point.speed,
      timestamp: new Date(point.timestamp)
    }));
  }

  // Split operations
  async addSplit(split: Omit<Split, 'id'>): Promise<number> {
    const db = this.getDb();
    const result = await db.runAsync(
      `INSERT INTO splits (run_id, split_number, distance, duration, pace, timestamp) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        split.runId,
        split.splitNumber,
        split.distance,
        split.duration,
        split.pace,
        split.timestamp.toISOString()
      ]
    );
    return result.lastInsertRowId;
  }

  async getSplits(runId: number): Promise<Split[]> {
    const db = this.getDb();
    const splits = await db.getAllAsync(
      'SELECT * FROM splits WHERE run_id = ? ORDER BY split_number',
      [runId]
    ) as any[];

    return splits.map(split => ({
      id: split.id,
      runId: split.run_id,
      splitNumber: split.split_number,
      distance: split.distance,
      duration: split.duration,
      pace: split.pace,
      timestamp: new Date(split.timestamp)
    }));
  }

  // Settings operations
  async getSettings(): Promise<AppSettings> {
    const db = this.getDb();
    const settings = await db.getFirstAsync('SELECT * FROM settings LIMIT 1') as any;

    if (!settings) {
      throw new Error('Settings not found');
    }

    return {
      announcementFrequencyMinutes: settings.announcement_frequency_minutes,
      announcementFrequencyDistance: settings.announcement_frequency_distance,
      hapticDistanceEnabled: Boolean(settings.haptic_distance_enabled),
      hapticTimeEnabled: Boolean(settings.haptic_time_enabled),
      voiceRate: settings.voice_rate,
      voicePitch: settings.voice_pitch,
      autoPauseEnabled: Boolean(settings.auto_pause_enabled)
    };
  }

  async updateSettings(settings: Partial<AppSettings>): Promise<void> {
    const db = this.getDb();
    const fields: string[] = [];
    const values: any[] = [];

    if (settings.announcementFrequencyMinutes !== undefined) {
      fields.push('announcement_frequency_minutes = ?');
      values.push(settings.announcementFrequencyMinutes);
    }
    if (settings.announcementFrequencyDistance !== undefined) {
      fields.push('announcement_frequency_distance = ?');
      values.push(settings.announcementFrequencyDistance);
    }
    if (settings.hapticDistanceEnabled !== undefined) {
      fields.push('haptic_distance_enabled = ?');
      values.push(settings.hapticDistanceEnabled ? 1 : 0);
    }
    if (settings.hapticTimeEnabled !== undefined) {
      fields.push('haptic_time_enabled = ?');
      values.push(settings.hapticTimeEnabled ? 1 : 0);
    }
    if (settings.voiceRate !== undefined) {
      fields.push('voice_rate = ?');
      values.push(settings.voiceRate);
    }
    if (settings.voicePitch !== undefined) {
      fields.push('voice_pitch = ?');
      values.push(settings.voicePitch);
    }
    if (settings.autoPauseEnabled !== undefined) {
      fields.push('auto_pause_enabled = ?');
      values.push(settings.autoPauseEnabled ? 1 : 0);
    }

    if (fields.length > 0) {
      fields.push('updated_at = ?');
      values.push(new Date().toISOString());

      await db.runAsync(
        `UPDATE settings SET ${fields.join(', ')} WHERE id = 1`,
        values
      );
    }
  }

  // Emergency contact operations
  async addEmergencyContact(contact: Omit<EmergencyContact, 'id' | 'createdAt'>): Promise<number> {
    const db = this.getDb();
    const result = await db.runAsync(
      'INSERT INTO emergency_contacts (name, phone_number, is_primary) VALUES (?, ?, ?)',
      [contact.name, contact.phoneNumber, contact.isPrimary ? 1 : 0]
    );
    return result.lastInsertRowId;
  }

  async getEmergencyContacts(): Promise<EmergencyContact[]> {
    const db = this.getDb();
    const contacts = await db.getAllAsync(
      'SELECT * FROM emergency_contacts ORDER BY is_primary DESC, name'
    ) as any[];

    return contacts.map(contact => ({
      id: contact.id,
      name: contact.name,
      phoneNumber: contact.phone_number,
      isPrimary: Boolean(contact.is_primary),
      createdAt: new Date(contact.created_at)
    }));
  }

  async updateEmergencyContact(id: number, contact: Partial<EmergencyContact>): Promise<void> {
    const db = this.getDb();
    const fields: string[] = [];
    const values: any[] = [];

    if (contact.name !== undefined) {
      fields.push('name = ?');
      values.push(contact.name);
    }
    if (contact.phoneNumber !== undefined) {
      fields.push('phone_number = ?');
      values.push(contact.phoneNumber);
    }
    if (contact.isPrimary !== undefined) {
      fields.push('is_primary = ?');
      values.push(contact.isPrimary ? 1 : 0);
    }

    if (fields.length > 0) {
      values.push(id);
      await db.runAsync(
        `UPDATE emergency_contacts SET ${fields.join(', ')} WHERE id = ?`,
        values
      );
    }
  }

  async deleteEmergencyContact(id: number): Promise<void> {
    const db = this.getDb();
    await db.runAsync('DELETE FROM emergency_contacts WHERE id = ?', [id]);
  }

  async clearEmergencyContacts(): Promise<void> {
    const db = this.getDb();
    await db.runAsync('DELETE FROM emergency_contacts');
  }
}