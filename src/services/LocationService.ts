import * as ExpoLocation from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { LocationService, Location, MotionState } from './interfaces';
import { BACKGROUND_LOCATION_TASK, setActiveRunId } from './BackgroundLocationTask';
import { DatabaseService } from '../database';
import { ErrorHandlingService } from './ErrorHandlingService';
import { OfflineDataService } from './OfflineDataService';
import { PerformanceService } from './PerformanceService';

export class LocationServiceImpl implements LocationService {
  private isTracking = false;
  private isBackgroundTracking = false;
  private locationHistory: Location[] = [];
  private currentLocation: Location | null = null;
  private locationSubscription: ExpoLocation.LocationSubscription | null = null;
  private activeRunId: number | null = null;
  private motionStateHistory: { state: MotionState; timestamp: Date }[] = [];
  private lastMotionCheck = new Date();
  private autoPauseThreshold = 1; // km/h
  private autoResumeThreshold = 2; // km/h
  private autoPauseDelay = 30000; // 30 seconds in milliseconds
  private errorHandler: ErrorHandlingService;
  private offlineDataService: OfflineDataService;
  private performanceService: PerformanceService;
  private gpsSignalLost = false;
  private lastGpsSignalTime: Date | null = null;
  private gpsCheckInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.errorHandler = ErrorHandlingService.getInstance();
    this.offlineDataService = OfflineDataService.getInstance();
    this.performanceService = PerformanceService.getInstance();
  }

  async startTracking(runId?: number, enableBackground = true): Promise<void> {
    if (this.isTracking) {
      return;
    }

    try {
      // Store the active run ID for background tracking
      if (runId) {
        this.activeRunId = runId;
        setActiveRunId(runId);
      }

      // Request foreground location permissions
      const { status: foregroundStatus } = await ExpoLocation.requestForegroundPermissionsAsync();
      if (foregroundStatus !== 'granted') {
        await this.errorHandler.reportGPSPermissionDenied();
        throw new Error('Foreground location permission not granted');
      }

      // Request background location permissions if needed
      if (enableBackground) {
        const { status: backgroundStatus } = await ExpoLocation.requestBackgroundPermissionsAsync();
        if (backgroundStatus !== 'granted') {
          await this.errorHandler.reportBackgroundLocationDenied();
          console.warn('Background location permission not granted, continuing with foreground only');
          enableBackground = false;
        }
      }

    // Get optimal GPS update interval based on battery and performance
    const optimalInterval = this.performanceService.getOptimalGpsUpdateInterval();
    
    // Start foreground location tracking
    this.locationSubscription = await ExpoLocation.watchPositionAsync(
      {
        accuracy: ExpoLocation.Accuracy.BestForNavigation,
        timeInterval: optimalInterval,
        distanceInterval: Math.max(1, optimalInterval / 1000), // Scale distance interval with time
      },
      async (location) => {
        const locationData: Location = {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          altitude: location.coords.altitude || undefined,
          accuracy: location.coords.accuracy || undefined,
          speed: location.coords.speed || undefined,
          timestamp: new Date(location.timestamp),
        };

        this.currentLocation = locationData;
        this.locationHistory.push(locationData);

        // Store location in database if we have an active run
        if (this.activeRunId) {
          try {
            const db = await DatabaseService.getInstance();
            await db.addTrackPoint({
              runId: this.activeRunId,
              latitude: locationData.latitude,
              longitude: locationData.longitude,
              altitude: locationData.altitude,
              accuracy: locationData.accuracy,
              speed: locationData.speed,
              timestamp: locationData.timestamp,
            });
          } catch (error) {
            console.error('Error storing track point:', error);
            // Queue for offline sync
            await this.offlineDataService.queueOperation('add_track_point', {
              runId: this.activeRunId,
              latitude: locationData.latitude,
              longitude: locationData.longitude,
              altitude: locationData.altitude,
              accuracy: locationData.accuracy,
              speed: locationData.speed,
              timestamp: locationData.timestamp,
            });
          }
        }

        // Update GPS signal status
        this.updateGpsSignalStatus(locationData);

        // Check motion state for auto-pause/resume
        this.checkMotionState();
      }
    );

    // Start background location tracking if enabled and permissions granted
    if (enableBackground) {
      try {
        // Use performance-optimized intervals for background tracking
        const backgroundInterval = Math.max(optimalInterval * 2, 5000);
        
        await ExpoLocation.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
          accuracy: ExpoLocation.Accuracy.BestForNavigation,
          timeInterval: backgroundInterval,
          distanceInterval: Math.max(5, backgroundInterval / 1000),
          deferredUpdatesInterval: Math.max(10000, backgroundInterval * 2),
          foregroundService: {
            notificationTitle: 'Blind Runner App',
            notificationBody: 'Tracking your run in the background',
            notificationColor: '#000000',
          },
        });
        this.isBackgroundTracking = true;
      } catch (error) {
        console.error('Failed to start background location tracking:', error);
      }
    }

    this.isTracking = true;
    
    // Start GPS signal monitoring
    this.startGpsSignalMonitoring();
    
    } catch (error) {
      console.error('Failed to start location tracking:', error);
      throw error;
    }
  }

  async stopTracking(): Promise<void> {
    if (!this.isTracking) {
      return;
    }

    // Stop foreground location tracking
    if (this.locationSubscription) {
      this.locationSubscription.remove();
      this.locationSubscription = null;
    }

    // Stop background location tracking
    if (this.isBackgroundTracking) {
      try {
        const isTaskRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_LOCATION_TASK);
        if (isTaskRegistered) {
          await ExpoLocation.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
        }
        this.isBackgroundTracking = false;
      } catch (error) {
        console.error('Error stopping background location tracking:', error);
      }
    }

    this.isTracking = false;
    this.activeRunId = null;
    this.motionStateHistory = [];
    setActiveRunId(null);
  }

  async getCurrentLocation(): Promise<Location> {
    if (this.currentLocation) {
      return this.currentLocation;
    }

    // Get current location if not tracking
    const { status } = await ExpoLocation.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      throw new Error('Location permission not granted');
    }

    const location = await ExpoLocation.getCurrentPositionAsync({
      accuracy: ExpoLocation.Accuracy.BestForNavigation,
    });

    const locationData: Location = {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      altitude: location.coords.altitude || undefined,
      accuracy: location.coords.accuracy || undefined,
      speed: location.coords.speed || undefined,
      timestamp: new Date(location.timestamp),
    };

    return locationData;
  }

  getLocationHistory(): Location[] {
    return [...this.locationHistory];
  }

  calculateDistance(points: Location[]): number {
    if (points.length < 2) {
      return 0;
    }

    let totalDistance = 0;
    for (let i = 1; i < points.length; i++) {
      totalDistance += this.haversineDistance(points[i - 1], points[i]);
    }

    return totalDistance;
  }

  detectMotionState(): MotionState {
    if (!this.currentLocation || this.locationHistory.length < 2) {
      return MotionState.STATIONARY;
    }

    // Get recent locations (last 30 seconds)
    const now = new Date();
    const recentLocations = this.locationHistory.filter(
      (loc) => now.getTime() - loc.timestamp.getTime() <= 30000
    );

    if (recentLocations.length < 2) {
      return MotionState.STATIONARY;
    }

    // Calculate average speed from recent locations
    const distances = [];
    const times = [];
    
    for (let i = 1; i < recentLocations.length; i++) {
      const distance = this.haversineDistance(recentLocations[i - 1], recentLocations[i]);
      const timeDiff = (recentLocations[i].timestamp.getTime() - recentLocations[i - 1].timestamp.getTime()) / 1000;
      
      if (timeDiff > 0) {
        distances.push(distance);
        times.push(timeDiff);
      }
    }

    if (distances.length === 0) {
      return MotionState.STATIONARY;
    }

    const totalDistance = distances.reduce((sum, d) => sum + d, 0);
    const totalTime = times.reduce((sum, t) => sum + t, 0);
    const averageSpeed = totalDistance / totalTime; // m/s

    // Convert to km/h for thresholds
    const speedKmh = averageSpeed * 3.6;

    if (speedKmh < 1) {
      return MotionState.STATIONARY;
    } else if (speedKmh < 6) {
      return MotionState.WALKING;
    } else {
      return MotionState.RUNNING;
    }
  }

  /**
   * Check motion state and trigger auto-pause/resume events
   */
  private checkMotionState(): void {
    const currentState = this.detectMotionState();
    const now = new Date();

    // Add current state to history
    this.motionStateHistory.push({ state: currentState, timestamp: now });

    // Keep only last 2 minutes of motion state history
    this.motionStateHistory = this.motionStateHistory.filter(
      (entry) => now.getTime() - entry.timestamp.getTime() <= 120000
    );

    // Check if we should trigger auto-pause or auto-resume
    this.evaluateAutoPauseResume(currentState, now);
  }

  /**
   * Evaluate whether to trigger auto-pause or auto-resume based on motion state
   */
  private evaluateAutoPauseResume(currentState: MotionState, now: Date): void {
    // Check for auto-pause condition (stationary for 30 seconds)
    if (currentState === MotionState.STATIONARY) {
      const stationaryDuration = this.getConsecutiveStateDuration(MotionState.STATIONARY, now);
      if (stationaryDuration >= this.autoPauseDelay) {
        this.triggerAutoPause();
      }
    }

    // Check for auto-resume condition (moving after being stationary)
    if (currentState === MotionState.WALKING || currentState === MotionState.RUNNING) {
      const movingDuration = this.getConsecutiveMovingDuration(now);
      if (movingDuration >= 5000) { // 5 seconds of movement
        this.triggerAutoResume();
      }
    }
  }

  /**
   * Get duration of consecutive state in milliseconds
   */
  private getConsecutiveStateDuration(state: MotionState, now: Date): number {
    let duration = 0;
    
    // Look backwards through motion state history
    for (let i = this.motionStateHistory.length - 1; i >= 0; i--) {
      const entry = this.motionStateHistory[i];
      if (entry.state === state) {
        duration = now.getTime() - entry.timestamp.getTime();
      } else {
        break;
      }
    }

    return duration;
  }

  /**
   * Get duration of consecutive moving states (walking or running)
   */
  private getConsecutiveMovingDuration(now: Date): number {
    let duration = 0;
    
    // Look backwards through motion state history
    for (let i = this.motionStateHistory.length - 1; i >= 0; i--) {
      const entry = this.motionStateHistory[i];
      if (entry.state === MotionState.WALKING || entry.state === MotionState.RUNNING) {
        duration = now.getTime() - entry.timestamp.getTime();
      } else {
        break;
      }
    }

    return duration;
  }

  /**
   * Trigger auto-pause event
   */
  private triggerAutoPause(): void {
    console.log('Auto-pause triggered');
    if (this.onAutoPause) {
      this.onAutoPause();
    }
  }

  /**
   * Trigger auto-resume event
   */
  private triggerAutoResume(): void {
    console.log('Auto-resume triggered');
    if (this.onAutoResume) {
      this.onAutoResume();
    }
  }

  /**
   * Calculate distance between two points using Haversine formula
   * Returns distance in meters
   */
  private haversineDistance(point1: Location, point2: Location): number {
    const R = 6371000; // Earth's radius in meters
    const lat1Rad = (point1.latitude * Math.PI) / 180;
    const lat2Rad = (point2.latitude * Math.PI) / 180;
    const deltaLatRad = ((point2.latitude - point1.latitude) * Math.PI) / 180;
    const deltaLonRad = ((point2.longitude - point1.longitude) * Math.PI) / 180;

    const a =
      Math.sin(deltaLatRad / 2) * Math.sin(deltaLatRad / 2) +
      Math.cos(lat1Rad) *
        Math.cos(lat2Rad) *
        Math.sin(deltaLonRad / 2) *
        Math.sin(deltaLonRad / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;

    return distance;
  }

  /**
   * Calculate current pace based on recent location data
   * Returns pace in minutes per kilometer
   */
  calculateCurrentPace(windowSeconds = 60): number {
    if (this.locationHistory.length < 2) {
      return 0;
    }

    const now = new Date();
    const windowStart = new Date(now.getTime() - windowSeconds * 1000);
    
    // Get locations within the time window
    const recentLocations = this.locationHistory.filter(
      (loc) => loc.timestamp >= windowStart
    );

    if (recentLocations.length < 2) {
      return 0;
    }

    // Calculate distance and time for the window
    const distance = this.calculateDistance(recentLocations); // meters
    const timeSpan = (recentLocations[recentLocations.length - 1].timestamp.getTime() - 
                     recentLocations[0].timestamp.getTime()) / 1000; // seconds

    if (distance === 0 || timeSpan === 0) {
      return 0;
    }

    // Convert to pace (minutes per kilometer)
    const distanceKm = distance / 1000;
    const timeMinutes = timeSpan / 60;
    const pace = timeMinutes / distanceKm;

    return pace;
  }

  /**
   * Calculate average pace for the entire session
   * Returns pace in minutes per kilometer
   */
  calculateAveragePace(): number {
    if (this.locationHistory.length < 2) {
      return 0;
    }

    const totalDistance = this.calculateDistance(this.locationHistory); // meters
    const totalTime = (this.locationHistory[this.locationHistory.length - 1].timestamp.getTime() - 
                      this.locationHistory[0].timestamp.getTime()) / 1000; // seconds

    if (totalDistance === 0 || totalTime === 0) {
      return 0;
    }

    // Convert to pace (minutes per kilometer)
    const distanceKm = totalDistance / 1000;
    const timeMinutes = totalTime / 60;
    const pace = timeMinutes / distanceKm;

    return pace;
  }

  /**
   * Get smoothed pace using rolling average
   * Returns pace in minutes per kilometer
   */
  getSmoothedPace(windowSize = 10): number {
    if (this.locationHistory.length < windowSize) {
      return this.calculateCurrentPace();
    }

    const recentLocations = this.locationHistory.slice(-windowSize);
    const paces: number[] = [];

    // Calculate pace for each segment
    for (let i = 1; i < recentLocations.length; i++) {
      const distance = this.haversineDistance(recentLocations[i - 1], recentLocations[i]);
      const timeDiff = (recentLocations[i].timestamp.getTime() - 
                       recentLocations[i - 1].timestamp.getTime()) / 1000;

      if (distance > 0 && timeDiff > 0) {
        const distanceKm = distance / 1000;
        const timeMinutes = timeDiff / 60;
        const pace = timeMinutes / distanceKm;
        
        // Filter out unrealistic pace values (faster than 2 min/km or slower than 20 min/km)
        if (pace >= 2 && pace <= 20) {
          paces.push(pace);
        }
      }
    }

    if (paces.length === 0) {
      return 0;
    }

    // Return average of valid paces
    return paces.reduce((sum, pace) => sum + pace, 0) / paces.length;
  }

  /**
   * Get total distance traveled in meters
   */
  getTotalDistance(): number {
    return this.calculateDistance(this.locationHistory);
  }

  /**
   * Get total elapsed time in seconds
   */
  getTotalTime(): number {
    if (this.locationHistory.length < 2) {
      return 0;
    }

    return (this.locationHistory[this.locationHistory.length - 1].timestamp.getTime() - 
            this.locationHistory[0].timestamp.getTime()) / 1000;
  }

  /**
   * Check if background location tracking is active
   */
  isBackgroundTrackingActive(): boolean {
    return this.isBackgroundTracking;
  }

  /**
   * Set auto-pause/resume thresholds
   */
  setAutoPauseSettings(pauseThresholdKmh: number, resumeThresholdKmh: number, delayMs: number): void {
    this.autoPauseThreshold = pauseThresholdKmh;
    this.autoResumeThreshold = resumeThresholdKmh;
    this.autoPauseDelay = delayMs;
  }

  /**
   * Set callback for auto-pause events
   */
  onAutoPause?: () => void;

  /**
   * Set callback for auto-resume events
   */
  onAutoResume?: () => void;

  // Helper method to clear location history (useful for testing)
  clearLocationHistory(): void {
    this.locationHistory = [];
    this.currentLocation = null;
    this.motionStateHistory = [];
    this.activeRunId = null;
  }

  // GPS signal monitoring methods
  private startGpsSignalMonitoring(): void {
    if (this.gpsCheckInterval) {
      clearInterval(this.gpsCheckInterval);
    }

    this.gpsCheckInterval = setInterval(() => {
      this.checkGpsSignalHealth();
    }, 10000); // Check every 10 seconds
  }

  private stopGpsSignalMonitoring(): void {
    if (this.gpsCheckInterval) {
      clearInterval(this.gpsCheckInterval);
      this.gpsCheckInterval = null;
    }
  }

  private updateGpsSignalStatus(location: Location): void {
    this.lastGpsSignalTime = new Date();
    
    // If we were in a GPS lost state, report recovery
    if (this.gpsSignalLost) {
      this.gpsSignalLost = false;
      console.log('GPS signal restored');
      // Note: TTS announcement will be handled by the error handler
    }
  }

  private checkGpsSignalHealth(): void {
    const now = new Date();
    const timeSinceLastSignal = this.lastGpsSignalTime 
      ? now.getTime() - this.lastGpsSignalTime.getTime()
      : Infinity;

    // Consider GPS lost if no signal for 30 seconds
    if (timeSinceLastSignal > 30000 && !this.gpsSignalLost) {
      this.gpsSignalLost = true;
      console.log('GPS signal lost detected');
      this.errorHandler.reportGPSSignalLost(this);
    }
  }

  // Public method to check GPS signal status
  isGpsSignalHealthy(): boolean {
    return !this.gpsSignalLost;
  }

  // Enhanced stop tracking with cleanup
  async stopTracking(): Promise<void> {
    if (!this.isTracking) {
      return;
    }

    // Stop GPS monitoring
    this.stopGpsSignalMonitoring();

    // Stop foreground location tracking
    if (this.locationSubscription) {
      this.locationSubscription.remove();
      this.locationSubscription = null;
    }

    // Stop background location tracking
    if (this.isBackgroundTracking) {
      try {
        const isTaskRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_LOCATION_TASK);
        if (isTaskRegistered) {
          await ExpoLocation.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
        }
        this.isBackgroundTracking = false;
      } catch (error) {
        console.error('Error stopping background location tracking:', error);
      }
    }

    this.isTracking = false;
    this.activeRunId = null;
    this.motionStateHistory = [];
    this.gpsSignalLost = false;
    this.lastGpsSignalTime = null;
    setActiveRunId(null);
  }

  // Fallback location method for when GPS is unavailable
  async getLastKnownLocation(): Promise<Location | null> {
    try {
      const lastKnown = await ExpoLocation.getLastKnownPositionAsync();
      if (lastKnown) {
        return {
          latitude: lastKnown.coords.latitude,
          longitude: lastKnown.coords.longitude,
          altitude: lastKnown.coords.altitude || undefined,
          accuracy: lastKnown.coords.accuracy || undefined,
          speed: lastKnown.coords.speed || undefined,
          timestamp: new Date(lastKnown.timestamp),
        };
      }
      return null;
    } catch (error) {
      console.error('Failed to get last known location:', error);
      return null;
    }
  }

  // Method to attempt GPS recovery
  async attemptGpsRecovery(): Promise<boolean> {
    try {
      // Try to get current location to test GPS
      const location = await ExpoLocation.getCurrentPositionAsync({
        accuracy: ExpoLocation.Accuracy.BestForNavigation,
        timeout: 10000,
      });

      if (location) {
        this.updateGpsSignalStatus({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          altitude: location.coords.altitude || undefined,
          accuracy: location.coords.accuracy || undefined,
          speed: location.coords.speed || undefined,
          timestamp: new Date(location.timestamp),
        });
        return true;
      }
      return false;
    } catch (error) {
      console.error('GPS recovery attempt failed:', error);
      return false;
    }
  }
}