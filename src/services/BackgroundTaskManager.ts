import { AppState, AppStateStatus } from 'react-native';
import { MMKV } from 'react-native-mmkv';
import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';
import { DatabaseService } from '../database/DatabaseService';
import { RunTrackingServiceImpl } from './RunTrackingService';
import { LocationServiceImpl } from './LocationService';

export interface AppStateData {
  activeRunId: number | null;
  runStartTime: Date | null;
  isPaused: boolean;
  lastSaveTime: Date;
  appVersion: string;
}

export interface BackgroundTaskInfo {
  taskName: string;
  isRegistered: boolean;
  lastExecution: Date | null;
  executionCount: number;
  status: 'active' | 'inactive' | 'error';
}

const BACKGROUND_SYNC_TASK = 'background-sync-task';
const APP_STATE_KEY = 'app_state_data';

export class BackgroundTaskManager {
  private static instance: BackgroundTaskManager;
  private storage = new MMKV({ id: 'background_tasks' });
  private appStateSubscription: any = null;
  private runTrackingService: RunTrackingServiceImpl | null = null;
  private locationService: LocationServiceImpl | null = null;
  private databaseService: DatabaseService | null = null;
  
  private currentAppState: AppStateStatus = AppState.currentState;
  private backgroundStartTime: Date | null = null;
  private foregroundRestoreCallbacks: Array<() => void> = [];

  private constructor() {
    this.initializeServices();
    this.setupAppStateHandling();
    this.registerBackgroundTasks();
  }

  static getInstance(): BackgroundTaskManager {
    if (!BackgroundTaskManager.instance) {
      BackgroundTaskManager.instance = new BackgroundTaskManager();
    }
    return BackgroundTaskManager.instance;
  }

  private async initializeServices(): Promise<void> {
    try {
      this.databaseService = await DatabaseService.getInstance();
      this.locationService = new LocationServiceImpl();
      this.runTrackingService = new RunTrackingServiceImpl(this.locationService);
    } catch (error) {
      console.error('Failed to initialize services:', error);
    }
  }

  private setupAppStateHandling(): void {
    this.appStateSubscription = AppState.addEventListener('change', (nextAppState) => {
      this.handleAppStateChange(this.currentAppState, nextAppState);
      this.currentAppState = nextAppState;
    });
  }

  private async registerBackgroundTasks(): Promise<void> {
    try {
      // Define background sync task
      TaskManager.defineTask(BACKGROUND_SYNC_TASK, async () => {
        try {
          await this.performBackgroundSync();
          return BackgroundFetch.BackgroundFetchResult.NewData;
        } catch (error) {
          console.error('Background sync failed:', error);
          return BackgroundFetch.BackgroundFetchResult.Failed;
        }
      });

      // Register background fetch
      const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_SYNC_TASK);
      if (!isRegistered) {
        await BackgroundFetch.registerTaskAsync(BACKGROUND_SYNC_TASK, {
          minimumInterval: 60000, // 1 minute minimum interval
          stopOnTerminate: false,
          startOnBoot: true,
        });
      }
    } catch (error) {
      console.error('Failed to register background tasks:', error);
    }
  }

  private handleAppStateChange(previousState: AppStateStatus, nextState: AppStateStatus): void {
    console.log(`App state changed from ${previousState} to ${nextState}`);

    if (nextState === 'background') {
      this.handleAppGoingToBackground();
    } else if (nextState === 'active' && previousState === 'background') {
      this.handleAppComingToForeground();
    }
  }

  private async handleAppGoingToBackground(): Promise<void> {
    this.backgroundStartTime = new Date();
    
    try {
      // Save current app state
      await this.saveAppState();
      
      // Optimize services for background operation
      await this.optimizeForBackground();
      
      console.log('App state saved for background operation');
    } catch (error) {
      console.error('Failed to handle app going to background:', error);
    }
  }

  private async handleAppComingToForeground(): Promise<void> {
    try {
      // Calculate background duration
      const backgroundDuration = this.backgroundStartTime 
        ? new Date().getTime() - this.backgroundStartTime.getTime()
        : 0;

      console.log(`App was in background for ${backgroundDuration}ms`);

      // Restore app state
      await this.restoreAppState();
      
      // Restore services from background optimization
      await this.restoreFromBackground();
      
      // Execute foreground restore callbacks
      this.foregroundRestoreCallbacks.forEach(callback => {
        try {
          callback();
        } catch (error) {
          console.error('Foreground restore callback failed:', error);
        }
      });

      this.backgroundStartTime = null;
    } catch (error) {
      console.error('Failed to handle app coming to foreground:', error);
    }
  }

  private async saveAppState(): Promise<void> {
    if (!this.runTrackingService) {
      return;
    }

    try {
      const isRunning = this.runTrackingService.isRunning();
      const isPaused = this.runTrackingService.isPaused();
      
      let activeRunId: number | null = null;
      let runStartTime: Date | null = null;

      if (isRunning) {
        const currentMetrics = this.runTrackingService.getCurrentMetrics();
        // We need to get the run ID from the current run data
        // This would require accessing the private currentRun property
        // For now, we'll store what we can
        runStartTime = new Date(); // This should be the actual start time
      }

      const appStateData: AppStateData = {
        activeRunId,
        runStartTime,
        isPaused,
        lastSaveTime: new Date(),
        appVersion: '1.0.0', // This should come from app config
      };

      this.storage.set(APP_STATE_KEY, JSON.stringify(appStateData));
    } catch (error) {
      console.error('Failed to save app state:', error);
    }
  }

  private async restoreAppState(): Promise<boolean> {
    try {
      const savedStateJson = this.storage.getString(APP_STATE_KEY);
      if (!savedStateJson) {
        return false;
      }

      const savedState: AppStateData = JSON.parse(savedStateJson);
      
      // Check if we have an active run to restore
      if (savedState.activeRunId && this.runTrackingService && this.databaseService) {
        try {
          // Attempt to restore the active run
          const restored = await this.runTrackingService.restoreActiveRun();
          if (restored) {
            console.log('Successfully restored active run');
            return true;
          }
        } catch (error) {
          console.error('Failed to restore active run:', error);
        }
      }

      return false;
    } catch (error) {
      console.error('Failed to restore app state:', error);
      return false;
    }
  }

  private async optimizeForBackground(): Promise<void> {
    // Reduce update frequencies and disable non-essential features
    console.log('Optimizing services for background operation');
    
    // The actual optimization would be handled by individual services
    // This is a coordination point
  }

  private async restoreFromBackground(): Promise<void> {
    // Restore normal operation frequencies and re-enable features
    console.log('Restoring services from background optimization');
    
    // The actual restoration would be handled by individual services
    // This is a coordination point
  }

  private async performBackgroundSync(): Promise<void> {
    if (!this.databaseService) {
      return;
    }

    try {
      // Perform any necessary background data synchronization
      // For now, this is mainly housekeeping tasks
      
      // Clean up old performance logs
      const performanceLogs = this.storage.getString('performanceLogs');
      if (performanceLogs) {
        const logs = JSON.parse(performanceLogs);
        const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        
        const filteredLogs = logs.filter((log: any) => 
          new Date(log.timestamp) > oneWeekAgo
        );
        
        this.storage.set('performanceLogs', JSON.stringify(filteredLogs));
      }

      // Update background task execution count
      this.incrementTaskExecutionCount(BACKGROUND_SYNC_TASK);
      
      console.log('Background sync completed');
    } catch (error) {
      console.error('Background sync error:', error);
      throw error;
    }
  }

  private incrementTaskExecutionCount(taskName: string): void {
    const key = `task_count_${taskName}`;
    const currentCount = this.storage.getNumber(key) || 0;
    this.storage.set(key, currentCount + 1);
    this.storage.set(`task_last_execution_${taskName}`, new Date().toISOString());
  }

  // Public methods

  async getBackgroundTaskInfo(): Promise<BackgroundTaskInfo[]> {
    const tasks: BackgroundTaskInfo[] = [];

    try {
      const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_SYNC_TASK);
      const executionCount = this.storage.getNumber(`task_count_${BACKGROUND_SYNC_TASK}`) || 0;
      const lastExecutionStr = this.storage.getString(`task_last_execution_${BACKGROUND_SYNC_TASK}`);
      const lastExecution = lastExecutionStr ? new Date(lastExecutionStr) : null;

      tasks.push({
        taskName: BACKGROUND_SYNC_TASK,
        isRegistered,
        lastExecution,
        executionCount,
        status: isRegistered ? 'active' : 'inactive',
      });
    } catch (error) {
      console.error('Failed to get background task info:', error);
    }

    return tasks;
  }

  async forceAppStateRestore(): Promise<boolean> {
    return await this.restoreAppState();
  }

  clearAppState(): void {
    this.storage.delete(APP_STATE_KEY);
  }

  getAppStateData(): AppStateData | null {
    try {
      const savedStateJson = this.storage.getString(APP_STATE_KEY);
      if (savedStateJson) {
        return JSON.parse(savedStateJson);
      }
    } catch (error) {
      console.error('Failed to get app state data:', error);
    }
    return null;
  }

  addForegroundRestoreCallback(callback: () => void): void {
    this.foregroundRestoreCallbacks.push(callback);
  }

  removeForegroundRestoreCallback(callback: () => void): void {
    const index = this.foregroundRestoreCallbacks.indexOf(callback);
    if (index > -1) {
      this.foregroundRestoreCallbacks.splice(index, 1);
    }
  }

  async isAppKilledRecoveryNeeded(): Promise<boolean> {
    const appStateData = this.getAppStateData();
    if (!appStateData || !appStateData.activeRunId) {
      return false;
    }

    // Check if the app was killed while a run was active
    const timeSinceLastSave = new Date().getTime() - new Date(appStateData.lastSaveTime).getTime();
    const maxAllowedGap = 5 * 60 * 1000; // 5 minutes

    return timeSinceLastSave > maxAllowedGap;
  }

  async performAppKilledRecovery(): Promise<boolean> {
    try {
      const appStateData = this.getAppStateData();
      if (!appStateData || !this.databaseService) {
        return false;
      }

      // Attempt to recover the run state
      if (appStateData.activeRunId) {
        // Mark the run as potentially incomplete due to app termination
        await this.databaseService.updateRun(appStateData.activeRunId, {
          status: 'interrupted'
        });

        console.log('Marked interrupted run for recovery');
        return true;
      }

      return false;
    } catch (error) {
      console.error('Failed to perform app killed recovery:', error);
      return false;
    }
  }

  // Cleanup
  destroy(): void {
    if (this.appStateSubscription) {
      this.appStateSubscription.remove();
      this.appStateSubscription = null;
    }

    this.foregroundRestoreCallbacks = [];
  }
}