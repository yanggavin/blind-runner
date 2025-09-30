import { LocationServiceImpl } from './LocationService';
import { TTSServiceImpl } from './TTSService';
import { HapticServiceImpl } from './HapticService';
import { RunTrackingServiceImpl } from './RunTrackingService';
import { SOSService } from './SOSService';
import { HardwareButtonService } from './HardwareButtonService';
import { ErrorHandlingService } from './ErrorHandlingService';
import { PerformanceService } from './PerformanceService';
import { BackgroundTaskManager } from './BackgroundTaskManager';
import { OfflineDataService } from './OfflineDataService';
import { DatabaseService } from '../database/DatabaseService';
import { RunData, AppSettings, EmergencyContact } from '../models/types';

/**
 * Central service integration manager that coordinates all app services
 * and provides a unified interface for the main application flow
 */
export class ServiceIntegrationManager {
  private static instance: ServiceIntegrationManager;
  
  // Core services
  private locationService: LocationServiceImpl;
  private ttsService: TTSServiceImpl;
  private hapticService: HapticServiceImpl;
  private runTrackingService: RunTrackingServiceImpl;
  private sosService: SOSService;
  private hardwareButtonService: HardwareButtonService;
  
  // Support services
  private errorHandlingService: ErrorHandlingService;
  private performanceService: PerformanceService;
  private backgroundTaskManager: BackgroundTaskManager;
  private offlineDataService: OfflineDataService;
  private databaseService: DatabaseService;
  
  // State management
  private isInitialized = false;
  private currentRunId: number | null = null;
  private settings: AppSettings | null = null;

  private constructor() {
    // Initialize core services
    this.locationService = new LocationServiceImpl();
    this.ttsService = new TTSServiceImpl();
    this.hapticService = new HapticServiceImpl();
    this.runTrackingService = new RunTrackingServiceImpl(this.locationService);
    this.sosService = new SOSService();
    this.hardwareButtonService = new HardwareButtonService();
    
    // Initialize support services
    this.errorHandlingService = new ErrorHandlingService();
    this.performanceService = new PerformanceService();
    this.backgroundTaskManager = new BackgroundTaskManager();
    this.offlineDataService = new OfflineDataService();
    this.databaseService = new DatabaseService();
  }

  static getInstance(): ServiceIntegrationManager {
    if (!ServiceIntegrationManager.instance) {
      ServiceIntegrationManager.instance = new ServiceIntegrationManager();
    }
    return ServiceIntegrationManager.instance;
  }

  /**
   * Initialize all services and set up cross-service integrations
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // Initialize database first
      await this.databaseService.initialize();
      
      // Load app settings
      this.settings = await this.databaseService.getSettings();
      
      // Initialize services with error handling
      await this.errorHandlingService.withErrorHandling(async () => {
        await this.locationService.initialize();
        await this.ttsService.initialize();
        await this.hapticService.initialize();
        await this.runTrackingService.initialize();
        await this.sosService.initialize();
        await this.hardwareButtonService.initialize();
        await this.backgroundTaskManager.initialize();
        await this.offlineDataService.initialize();
        await this.performanceService.initialize();
      }, 'Service initialization');

      // Set up cross-service integrations
      this.setupServiceIntegrations();
      
      // Check for active run restoration
      await this.restoreActiveRunIfExists();
      
      this.isInitialized = true;
      
      await this.ttsService.speak('App initialized successfully');
      
    } catch (error) {
      await this.errorHandlingService.handleError(error, 'Service initialization failed');
      throw error;
    }
  }

  /**
   * Set up cross-service integrations and event listeners
   */
  private setupServiceIntegrations(): void {
    // Connect run tracking to TTS announcements
    this.runTrackingService.onRunStart = async (runData: RunData) => {
      await this.ttsService.announceRunStart();
      await this.hapticService.playRunStartPattern();
      this.currentRunId = runData.id;
    };

    this.runTrackingService.onRunPause = async () => {
      await this.ttsService.announceRunPause();
      await this.hapticService.playRunPausePattern();
    };

    this.runTrackingService.onRunResume = async () => {
      await this.ttsService.announceRunResume();
      await this.hapticService.playRunResumePattern();
    };

    this.runTrackingService.onRunComplete = async (runData: RunData) => {
      await this.ttsService.announceRunComplete(runData);
      await this.hapticService.playRunCompletePattern();
      this.currentRunId = null;
    };

    this.runTrackingService.onSplitComplete = async (splitData: any) => {
      await this.ttsService.announceSplit(splitData);
      await this.hapticService.playKilometerPattern();
    };

    this.runTrackingService.onHalfKilometer = async () => {
      await this.hapticService.playHalfKilometerPattern();
    };

    // Connect hardware button service to SOS
    this.hardwareButtonService.onLongPress = async () => {
      await this.triggerSOS();
    };

    // Connect location service to run tracking
    this.locationService.onLocationUpdate = (location) => {
      if (this.runTrackingService.isRunning()) {
        this.runTrackingService.addLocationPoint(location);
      }
    };

    // Connect performance monitoring
    this.performanceService.onPerformanceIssue = async (issue: string) => {
      await this.errorHandlingService.handleError(new Error(issue), 'Performance issue detected');
    };
  }

  /**
   * Start a new run with full service integration
   */
  async startRun(): Promise<RunData> {
    try {
      // Pre-flight checks
      await this.performPreflightChecks();
      
      // Start performance monitoring
      this.performanceService.startRunMonitoring();
      
      // Start background task management
      await this.backgroundTaskManager.startRunTracking();
      
      // Start the run
      const runData = await this.runTrackingService.startRun();
      
      // Enable hardware button monitoring for SOS
      await this.hardwareButtonService.enableSOSMonitoring();
      
      return runData;
      
    } catch (error) {
      await this.errorHandlingService.handleError(error, 'Failed to start run');
      throw error;
    }
  }

  /**
   * Pause the current run
   */
  async pauseRun(): Promise<void> {
    try {
      await this.runTrackingService.pauseRun();
      await this.backgroundTaskManager.pauseRunTracking();
    } catch (error) {
      await this.errorHandlingService.handleError(error, 'Failed to pause run');
      throw error;
    }
  }

  /**
   * Resume the current run
   */
  async resumeRun(): Promise<void> {
    try {
      await this.runTrackingService.resumeRun();
      await this.backgroundTaskManager.resumeRunTracking();
    } catch (error) {
      await this.errorHandlingService.handleError(error, 'Failed to resume run');
      throw error;
    }
  }

  /**
   * Stop the current run
   */
  async stopRun(): Promise<RunData> {
    try {
      const runData = await this.runTrackingService.stopRun();
      
      // Stop background tasks
      await this.backgroundTaskManager.stopRunTracking();
      
      // Disable SOS monitoring
      await this.hardwareButtonService.disableSOSMonitoring();
      
      // Stop performance monitoring
      this.performanceService.stopRunMonitoring();
      
      return runData;
      
    } catch (error) {
      await this.errorHandlingService.handleError(error, 'Failed to stop run');
      throw error;
    }
  }

  /**
   * Trigger emergency SOS functionality
   */
  async triggerSOS(): Promise<void> {
    try {
      const currentLocation = await this.locationService.getCurrentLocation();
      const emergencyContacts = await this.databaseService.getEmergencyContacts();
      
      if (emergencyContacts.length === 0) {
        await this.ttsService.speak('No emergency contacts configured. Please set up emergency contacts in settings.');
        return;
      }

      const runStatus = this.runTrackingService.isRunning() ? 'active run' : 'not running';
      
      await this.sosService.sendSOSMessage(currentLocation, runStatus, emergencyContacts);
      await this.ttsService.speak('SOS message sent to emergency contacts');
      await this.hapticService.playSOSConfirmationPattern();
      
    } catch (error) {
      await this.errorHandlingService.handleError(error, 'SOS activation failed');
      await this.ttsService.speak('SOS activation failed. Please try again or contact emergency services directly.');
    }
  }

  /**
   * Update app settings and propagate to all services
   */
  async updateSettings(newSettings: Partial<AppSettings>): Promise<void> {
    try {
      const updatedSettings = { ...this.settings, ...newSettings };
      await this.databaseService.updateSettings(updatedSettings);
      this.settings = updatedSettings;
      
      // Propagate settings to services
      await this.ttsService.updateSettings(updatedSettings);
      await this.hapticService.updateSettings(updatedSettings);
      await this.runTrackingService.updateSettings(updatedSettings);
      
      await this.ttsService.speak('Settings updated successfully');
      
    } catch (error) {
      await this.errorHandlingService.handleError(error, 'Failed to update settings');
      throw error;
    }
  }

  /**
   * Get current run metrics
   */
  getCurrentRunMetrics() {
    return this.runTrackingService.getCurrentMetrics();
  }

  /**
   * Check if a run is currently active
   */
  isRunActive(): boolean {
    return this.runTrackingService.isRunning();
  }

  /**
   * Check if a run is currently paused
   */
  isRunPaused(): boolean {
    return this.runTrackingService.isPaused();
  }

  /**
   * Get run history
   */
  async getRunHistory(): Promise<RunData[]> {
    try {
      return await this.databaseService.getAllRuns();
    } catch (error) {
      await this.errorHandlingService.handleError(error, 'Failed to load run history');
      return [];
    }
  }

  /**
   * Get specific run details
   */
  async getRunDetails(runId: number): Promise<RunData | null> {
    try {
      return await this.databaseService.getRunById(runId);
    } catch (error) {
      await this.errorHandlingService.handleError(error, 'Failed to load run details');
      return null;
    }
  }

  /**
   * Perform pre-flight checks before starting a run
   */
  private async performPreflightChecks(): Promise<void> {
    // Check location permissions
    const hasLocationPermission = await this.locationService.hasPermission();
    if (!hasLocationPermission) {
      throw new Error('Location permission required to start run');
    }

    // Check GPS availability
    const isGPSEnabled = await this.locationService.isGPSEnabled();
    if (!isGPSEnabled) {
      throw new Error('GPS must be enabled to start run');
    }

    // Check if another run is already active
    if (this.runTrackingService.isRunning()) {
      throw new Error('Another run is already active');
    }
  }

  /**
   * Restore active run if app was killed during a run
   */
  private async restoreActiveRunIfExists(): Promise<void> {
    try {
      const hasActiveRun = await this.runTrackingService.restoreActiveRun();
      if (hasActiveRun) {
        await this.backgroundTaskManager.resumeRunTracking();
        await this.hardwareButtonService.enableSOSMonitoring();
        this.performanceService.startRunMonitoring();
        
        await this.ttsService.speak('Active run restored');
      }
    } catch (error) {
      await this.errorHandlingService.handleError(error, 'Failed to restore active run');
    }
  }

  /**
   * Clean up resources when app is closing
   */
  async cleanup(): Promise<void> {
    try {
      await this.backgroundTaskManager.cleanup();
      await this.locationService.cleanup();
      await this.hardwareButtonService.cleanup();
      await this.performanceService.cleanup();
      
      this.isInitialized = false;
      
    } catch (error) {
      console.error('Error during cleanup:', error);
    }
  }

  // Getters for individual services (for testing and specific use cases)
  get services() {
    return {
      location: this.locationService,
      tts: this.ttsService,
      haptic: this.hapticService,
      runTracking: this.runTrackingService,
      sos: this.sosService,
      hardwareButton: this.hardwareButtonService,
      errorHandling: this.errorHandlingService,
      performance: this.performanceService,
      backgroundTask: this.backgroundTaskManager,
      offlineData: this.offlineDataService,
      database: this.databaseService,
    };
  }
}