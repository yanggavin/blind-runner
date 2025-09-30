import { RunTrackingService, RunData, RunMetrics, Location, Split, MotionState } from './interfaces';
import { LocationServiceImpl } from './LocationService';
import { DatabaseService } from '../database/DatabaseService';
import { TrackPoint } from '../models/types';
import { PerformanceService } from './PerformanceService';
import { BackgroundTaskManager } from './BackgroundTaskManager';

export class RunTrackingServiceImpl implements RunTrackingService {
  private currentRun: RunData | null = null;
  private runningState = false;
  private pausedState = false;
  private startTime: Date | null = null;
  private pausedTime: number = 0; // Total paused time in seconds
  private lastPauseStart: Date | null = null;
  private locationService: LocationServiceImpl;
  private databaseService: DatabaseService | null = null;
  private metricsUpdateInterval: NodeJS.Timeout | null = null;
  private autoDetectionInterval: NodeJS.Timeout | null = null;
  private trackPointSaveInterval: NodeJS.Timeout | null = null;
  private lastMotionState: MotionState = MotionState.STATIONARY;
  private autoPauseEnabled = true;
  private lastSavedSplitCount = 0;
  private performanceService: PerformanceService;
  private backgroundTaskManager: BackgroundTaskManager;

  constructor(locationService: LocationServiceImpl) {
    this.locationService = locationService;
    this.performanceService = PerformanceService.getInstance();
    this.backgroundTaskManager = BackgroundTaskManager.getInstance();
    this.initializeDatabase();
    this.setupPerformanceOptimizations();
  }

  private async initializeDatabase(): Promise<void> {
    try {
      this.databaseService = await DatabaseService.getInstance();
    } catch (error) {
      console.error('Failed to initialize database service:', error);
    }
  }

  private setupPerformanceOptimizations(): void {
    // Listen for power saving mode changes
    this.performanceService.onPowerSavingModeChange((enabled) => {
      this.adjustForPowerSaving(enabled);
    });

    // Listen for battery low warnings
    this.performanceService.onBatteryLow((level) => {
      this.handleLowBattery(level);
    });

    // Register for app state restoration
    this.backgroundTaskManager.addForegroundRestoreCallback(() => {
      this.handleAppRestoration();
    });
  }

  private adjustForPowerSaving(enabled: boolean): void {
    if (!this.runningState) {
      return;
    }

    if (enabled) {
      // Reduce update frequencies for power saving
      if (this.metricsUpdateInterval) {
        clearInterval(this.metricsUpdateInterval);
        this.metricsUpdateInterval = setInterval(() => {
          this.updateMetrics();
        }, 2000); // Update every 2 seconds instead of 1
      }

      if (this.trackPointSaveInterval) {
        clearInterval(this.trackPointSaveInterval);
        this.trackPointSaveInterval = setInterval(() => {
          this.saveCurrentTrackPoint();
        }, 30000); // Save every 30 seconds instead of 10
      }
    } else {
      // Restore normal frequencies
      if (this.metricsUpdateInterval) {
        clearInterval(this.metricsUpdateInterval);
        this.metricsUpdateInterval = setInterval(() => {
          this.updateMetrics();
        }, 1000); // Back to 1 second
      }

      if (this.trackPointSaveInterval) {
        clearInterval(this.trackPointSaveInterval);
        this.trackPointSaveInterval = setInterval(() => {
          this.saveCurrentTrackPoint();
        }, 10000); // Back to 10 seconds
      }
    }
  }

  private handleLowBattery(level: number): void {
    console.log(`Low battery detected: ${Math.round(level * 100)}%`);
    
    // Automatically enable power saving optimizations
    this.adjustForPowerSaving(true);
    
    // Could trigger TTS announcement about battery level
    // This would be handled by the UI layer in a real implementation
  }

  private handleAppRestoration(): void {
    // Check if we need to restore an active run
    if (!this.runningState) {
      this.restoreActiveRun().catch(error => {
        console.error('Failed to restore active run:', error);
      });
    }
  }

  async startRun(): Promise<void> {
    if (this.runningState) {
      throw new Error('Run is already active');
    }

    // Ensure database is initialized
    if (!this.databaseService) {
      await this.initializeDatabase();
    }

    this.startTime = new Date();
    this.pausedTime = 0;
    this.lastPauseStart = null;
    this.pausedState = false;
    this.runningState = true;
    this.lastSavedSplitCount = 0;

    // Create run in database and get the actual ID
    let runId: number;
    if (this.databaseService) {
      try {
        runId = await this.databaseService.createRun(this.startTime);
      } catch (error) {
        console.error('Failed to create run in database:', error);
        runId = Date.now(); // Fallback to timestamp
      }
    } else {
      runId = Date.now(); // Fallback to timestamp
    }

    // Initialize run data
    this.currentRun = {
      id: runId,
      startTime: this.startTime,
      totalDistance: 0,
      totalDuration: 0,
      averagePace: 0,
      status: 'active',
    };

    // Start location tracking
    await this.locationService.startTracking();

    // Start metrics update interval (every second)
    this.metricsUpdateInterval = setInterval(() => {
      this.updateMetrics();
    }, 1000);

    // Start auto-pause detection (every 5 seconds)
    if (this.autoPauseEnabled) {
      this.autoDetectionInterval = setInterval(() => {
        this.checkAutoDetection();
      }, 5000);
    }

    // Start track point saving interval (every 10 seconds)
    this.trackPointSaveInterval = setInterval(() => {
      this.saveCurrentTrackPoint();
    }, 10000);
  }

  async pauseRun(): Promise<void> {
    if (!this.runningState || this.pausedState) {
      throw new Error('No active run to pause');
    }

    this.pausedState = true;
    this.lastPauseStart = new Date();
    
    if (this.currentRun) {
      this.currentRun.status = 'paused';
      
      // Update run status in database
      if (this.databaseService) {
        try {
          await this.databaseService.updateRun(this.currentRun.id, {
            status: 'paused'
          });
        } catch (error) {
          console.error('Failed to update run status in database:', error);
        }
      }
    }

    // Stop location tracking during pause
    await this.locationService.stopTracking();
  }

  async resumeRun(): Promise<void> {
    if (!this.runningState || !this.pausedState) {
      throw new Error('No paused run to resume');
    }

    if (this.lastPauseStart) {
      const pauseDuration = (new Date().getTime() - this.lastPauseStart.getTime()) / 1000;
      this.pausedTime += pauseDuration;
      this.lastPauseStart = null;
    }

    this.pausedState = false;
    
    if (this.currentRun) {
      this.currentRun.status = 'active';
      
      // Update run status in database
      if (this.databaseService) {
        try {
          await this.databaseService.updateRun(this.currentRun.id, {
            status: 'active'
          });
        } catch (error) {
          console.error('Failed to update run status in database:', error);
        }
      }
    }

    // Resume location tracking
    await this.locationService.startTracking();
  }

  async stopRun(): Promise<RunData> {
    if (!this.runningState || !this.currentRun) {
      throw new Error('No active run to stop');
    }

    // If currently paused, add the pause time
    if (this.pausedState && this.lastPauseStart) {
      const pauseDuration = (new Date().getTime() - this.lastPauseStart.getTime()) / 1000;
      this.pausedTime += pauseDuration;
    }

    // Final metrics update and save
    this.updateMetrics();
    await this.saveCurrentTrackPoint(); // Save final track point
    await this.savePendingSplits(); // Save any pending splits

    // Stop tracking and intervals
    await this.locationService.stopTracking();
    if (this.metricsUpdateInterval) {
      clearInterval(this.metricsUpdateInterval);
      this.metricsUpdateInterval = null;
    }
    if (this.autoDetectionInterval) {
      clearInterval(this.autoDetectionInterval);
      this.autoDetectionInterval = null;
    }
    if (this.trackPointSaveInterval) {
      clearInterval(this.trackPointSaveInterval);
      this.trackPointSaveInterval = null;
    }

    // Finalize run data
    const endTime = new Date();
    this.currentRun.endTime = endTime;
    this.currentRun.status = 'completed';

    // Save final run data to database
    if (this.databaseService) {
      try {
        await this.databaseService.updateRun(this.currentRun.id, {
          endTime: endTime,
          totalDistance: this.currentRun.totalDistance,
          totalDuration: this.currentRun.totalDuration,
          averagePace: this.currentRun.averagePace,
          status: 'completed'
        });
      } catch (error) {
        console.error('Failed to save final run data to database:', error);
      }
    }

    const completedRun = { ...this.currentRun };

    // Reset state
    this.currentRun = null;
    this.runningState = false;
    this.pausedState = false;
    this.startTime = null;
    this.pausedTime = 0;
    this.lastPauseStart = null;
    this.lastSavedSplitCount = 0;

    return completedRun;
  }

  getCurrentMetrics(): RunMetrics {
    if (!this.currentRun || !this.startTime) {
      return {
        distance: 0,
        duration: 0,
        currentPace: 0,
        averagePace: 0,
        splits: [],
      };
    }

    const locations = this.locationService.getLocationHistory();
    const distance = this.locationService.calculateDistance(locations);
    const duration = this.calculateActiveDuration();
    const currentPace = this.calculateCurrentPace(locations);
    const averagePace = duration > 0 && distance > 0 ? (duration / 60) / (distance / 1000) : 0;
    const splits = this.calculateSplits(locations);

    return {
      distance,
      duration,
      currentPace,
      averagePace,
      splits,
    };
  }

  isRunning(): boolean {
    return this.runningState;
  }

  isPaused(): boolean {
    return this.pausedState;
  }

  // Configuration methods
  setAutoPauseEnabled(enabled: boolean): void {
    this.autoPauseEnabled = enabled;
    
    if (this.runningState) {
      if (enabled && !this.autoDetectionInterval) {
        this.autoDetectionInterval = setInterval(() => {
          this.checkAutoDetection();
        }, 5000);
      } else if (!enabled && this.autoDetectionInterval) {
        clearInterval(this.autoDetectionInterval);
        this.autoDetectionInterval = null;
      }
    }
  }

  private updateMetrics(): void {
    if (!this.currentRun || this.pausedState) {
      return;
    }

    const metrics = this.getCurrentMetrics();
    this.currentRun.totalDistance = metrics.distance;
    this.currentRun.totalDuration = metrics.duration;
    this.currentRun.averagePace = metrics.averagePace;

    // Save splits to database if new ones are available
    this.savePendingSplits();

    // Periodically update run data in database (every 30 seconds)
    if (metrics.duration > 0 && metrics.duration % 30 === 0) {
      this.saveRunProgress();
    }
  }

  private calculateActiveDuration(): number {
    if (!this.startTime) {
      return 0;
    }

    const now = new Date();
    const totalElapsed = (now.getTime() - this.startTime.getTime()) / 1000;
    
    let currentPauseDuration = 0;
    if (this.pausedState && this.lastPauseStart) {
      currentPauseDuration = (now.getTime() - this.lastPauseStart.getTime()) / 1000;
    }

    return Math.max(0, totalElapsed - this.pausedTime - currentPauseDuration);
  }

  private calculateCurrentPace(locations: Location[]): number {
    if (locations.length < 2) {
      return 0;
    }

    // Calculate pace from last 1km or last 10 data points, whichever is smaller
    const recentLocations = locations.slice(-10);
    const distance = this.locationService.calculateDistance(recentLocations);
    
    if (distance === 0) {
      return 0;
    }

    // Calculate time span for recent locations
    const timeSpan = (recentLocations[recentLocations.length - 1].timestamp.getTime() - 
                     recentLocations[0].timestamp.getTime()) / 1000;

    if (timeSpan === 0) {
      return 0;
    }

    // Pace in minutes per kilometer
    const paceSecondsPerMeter = timeSpan / distance;
    const paceMinutesPerKm = (paceSecondsPerMeter * 1000) / 60;

    return paceMinutesPerKm;
  }

  private calculateSplits(locations: Location[]): Split[] {
    const splits: Split[] = [];
    
    if (locations.length < 2) {
      return splits;
    }

    let currentDistance = 0;
    let splitStartIndex = 0;
    let splitNumber = 1;

    for (let i = 1; i < locations.length; i++) {
      const segmentDistance = this.locationService.calculateDistance([locations[i - 1], locations[i]]);
      currentDistance += segmentDistance;

      // Check if we've completed a kilometer
      if (currentDistance >= 1000) {
        const splitLocations = locations.slice(splitStartIndex, i + 1);
        const splitDistance = this.locationService.calculateDistance(splitLocations);
        const splitDuration = (locations[i].timestamp.getTime() - locations[splitStartIndex].timestamp.getTime()) / 1000;
        const splitPace = splitDuration > 0 ? (splitDuration / 60) / (splitDistance / 1000) : 0;

        splits.push({
          id: splitNumber,
          runId: this.currentRun?.id || 0,
          splitNumber,
          distance: splitDistance,
          duration: splitDuration,
          pace: splitPace,
          timestamp: locations[i].timestamp,
        });

        splitNumber++;
        splitStartIndex = i;
        currentDistance = 0;
      }
    }

    return splits;
  }

  private checkAutoDetection(): void {
    if (!this.autoPauseEnabled || !this.runningState) {
      return;
    }

    const motionState = this.locationService.detectMotionState();

    // Auto-pause logic: pause if stationary for more than 30 seconds
    if (!this.pausedState && motionState === MotionState.STATIONARY) {
      this.pauseRun().catch(console.error);
    }
    // Auto-resume logic: resume if moving after being paused
    else if (this.pausedState && (motionState === MotionState.WALKING || motionState === MotionState.RUNNING)) {
      this.resumeRun().catch(console.error);
    }

    this.lastMotionState = motionState;
  }

  private async saveCurrentTrackPoint(): Promise<void> {
    if (!this.currentRun || !this.databaseService || this.pausedState) {
      return;
    }

    try {
      const currentLocation = await this.locationService.getCurrentLocation();
      const trackPoint: Omit<TrackPoint, 'id'> = {
        runId: this.currentRun.id,
        latitude: currentLocation.latitude,
        longitude: currentLocation.longitude,
        altitude: currentLocation.altitude,
        accuracy: currentLocation.accuracy,
        speed: currentLocation.speed,
        timestamp: currentLocation.timestamp
      };

      await this.databaseService.addTrackPoint(trackPoint);
    } catch (error) {
      console.error('Failed to save track point:', error);
    }
  }

  private async savePendingSplits(): Promise<void> {
    if (!this.currentRun || !this.databaseService) {
      return;
    }

    try {
      const currentMetrics = this.getCurrentMetrics();
      const newSplits = currentMetrics.splits.slice(this.lastSavedSplitCount);

      for (const split of newSplits) {
        const splitData: Omit<Split, 'id'> = {
          runId: this.currentRun.id,
          splitNumber: split.splitNumber,
          distance: split.distance,
          duration: split.duration,
          pace: split.pace,
          timestamp: split.timestamp
        };

        await this.databaseService.addSplit(splitData);
      }

      this.lastSavedSplitCount = currentMetrics.splits.length;
    } catch (error) {
      console.error('Failed to save splits:', error);
    }
  }

  private async saveRunProgress(): Promise<void> {
    if (!this.currentRun || !this.databaseService) {
      return;
    }

    try {
      await this.databaseService.updateRun(this.currentRun.id, {
        totalDistance: this.currentRun.totalDistance,
        totalDuration: this.currentRun.totalDuration,
        averagePace: this.currentRun.averagePace
      });
    } catch (error) {
      console.error('Failed to save run progress:', error);
    }
  }

  // Public method to restore an active run from database (useful for app restart scenarios)
  async restoreActiveRun(): Promise<boolean> {
    if (this.runningState) {
      return false; // Already have an active run
    }

    if (!this.databaseService) {
      await this.initializeDatabase();
    }

    if (!this.databaseService) {
      return false;
    }

    try {
      const activeRun = await this.databaseService.getActiveRun();
      if (!activeRun) {
        return false;
      }

      // Restore run state
      this.currentRun = activeRun;
      this.startTime = activeRun.startTime;
      this.runningState = true;
      this.pausedState = activeRun.status === 'paused';

      // Calculate paused time based on current time vs last update
      if (this.pausedState) {
        this.lastPauseStart = new Date(); // Assume pause started now for simplicity
      }

      // Restart tracking if not paused
      if (!this.pausedState) {
        await this.locationService.startTracking();
        
        // Restart intervals
        this.metricsUpdateInterval = setInterval(() => {
          this.updateMetrics();
        }, 1000);

        if (this.autoPauseEnabled) {
          this.autoDetectionInterval = setInterval(() => {
            this.checkAutoDetection();
          }, 5000);
        }

        this.trackPointSaveInterval = setInterval(() => {
          this.saveCurrentTrackPoint();
        }, 10000);
      }

      return true;
    } catch (error) {
      console.error('Failed to restore active run:', error);
      return false;
    }
  }
}