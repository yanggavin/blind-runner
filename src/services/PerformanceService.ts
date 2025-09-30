import * as Battery from 'expo-battery';
import { AppState, AppStateStatus } from 'react-native';
import { MMKV } from 'react-native-mmkv';

export interface PerformanceMetrics {
  batteryLevel: number;
  batteryState: Battery.BatteryState;
  isLowPowerMode: boolean;
  memoryUsage?: number;
  gpsUpdateFrequency: number;
  backgroundTasksActive: number;
}

export interface PowerSavingSettings {
  gpsUpdateInterval: number;
  backgroundSyncEnabled: boolean;
  hapticFeedbackEnabled: boolean;
  ttsAnnouncementFrequency: number;
  screenBrightness?: number;
}

export interface AppStateInfo {
  currentState: AppStateStatus;
  backgroundTime: number;
  foregroundTime: number;
  lastStateChange: Date;
}

export class PerformanceService {
  private static instance: PerformanceService;
  private storage = new MMKV({ id: 'performance' });
  private batterySubscription: Battery.Subscription | null = null;
  private appStateSubscription: any = null;
  private performanceMonitorInterval: NodeJS.Timeout | null = null;
  
  private currentMetrics: PerformanceMetrics = {
    batteryLevel: 1.0,
    batteryState: Battery.BatteryState.UNKNOWN,
    isLowPowerMode: false,
    gpsUpdateFrequency: 1000,
    backgroundTasksActive: 0,
  };

  private appStateInfo: AppStateInfo = {
    currentState: AppState.currentState,
    backgroundTime: 0,
    foregroundTime: 0,
    lastStateChange: new Date(),
  };

  private powerSavingSettings: PowerSavingSettings = {
    gpsUpdateInterval: 1000,
    backgroundSyncEnabled: true,
    hapticFeedbackEnabled: true,
    ttsAnnouncementFrequency: 300000, // 5 minutes
  };

  private onBatteryLowCallback?: (level: number) => void;
  private onPowerSavingModeCallback?: (enabled: boolean) => void;
  private onAppStateChangeCallback?: (state: AppStateStatus) => void;

  private constructor() {
    this.loadSettings();
    this.initializeBatteryMonitoring();
    this.initializeAppStateMonitoring();
    this.startPerformanceMonitoring();
  }

  static getInstance(): PerformanceService {
    if (!PerformanceService.instance) {
      PerformanceService.instance = new PerformanceService();
    }
    return PerformanceService.instance;
  }

  private loadSettings(): void {
    const savedSettings = this.storage.getString('powerSavingSettings');
    if (savedSettings) {
      try {
        this.powerSavingSettings = { ...this.powerSavingSettings, ...JSON.parse(savedSettings) };
      } catch (error) {
        console.error('Failed to load power saving settings:', error);
      }
    }
  }

  private saveSettings(): void {
    try {
      this.storage.set('powerSavingSettings', JSON.stringify(this.powerSavingSettings));
    } catch (error) {
      console.error('Failed to save power saving settings:', error);
    }
  }

  private async initializeBatteryMonitoring(): Promise<void> {
    try {
      // Get initial battery state
      const batteryLevel = await Battery.getBatteryLevelAsync();
      const batteryState = await Battery.getBatteryStateAsync();
      const isLowPowerMode = await Battery.isLowPowerModeEnabledAsync();

      this.currentMetrics.batteryLevel = batteryLevel;
      this.currentMetrics.batteryState = batteryState;
      this.currentMetrics.isLowPowerMode = isLowPowerMode;

      // Subscribe to battery level changes
      this.batterySubscription = Battery.addBatteryLevelListener(({ batteryLevel }) => {
        this.currentMetrics.batteryLevel = batteryLevel;
        this.handleBatteryLevelChange(batteryLevel);
      });

      // Subscribe to low power mode changes
      Battery.addLowPowerModeListener(({ lowPowerMode }) => {
        this.currentMetrics.isLowPowerMode = lowPowerMode;
        this.handlePowerSavingModeChange(lowPowerMode);
      });

    } catch (error) {
      console.error('Failed to initialize battery monitoring:', error);
    }
  }

  private initializeAppStateMonitoring(): void {
    this.appStateSubscription = AppState.addEventListener('change', (nextAppState) => {
      const now = new Date();
      const timeDiff = now.getTime() - this.appStateInfo.lastStateChange.getTime();

      // Update time tracking
      if (this.appStateInfo.currentState === 'active') {
        this.appStateInfo.foregroundTime += timeDiff;
      } else {
        this.appStateInfo.backgroundTime += timeDiff;
      }

      this.appStateInfo.currentState = nextAppState;
      this.appStateInfo.lastStateChange = now;

      this.handleAppStateChange(nextAppState);
    });
  }

  private startPerformanceMonitoring(): void {
    // Monitor performance metrics every 30 seconds
    this.performanceMonitorInterval = setInterval(() => {
      this.updatePerformanceMetrics();
    }, 30000);
  }

  private async updatePerformanceMetrics(): Promise<void> {
    try {
      // Update battery metrics
      this.currentMetrics.batteryLevel = await Battery.getBatteryLevelAsync();
      this.currentMetrics.batteryState = await Battery.getBatteryStateAsync();
      this.currentMetrics.isLowPowerMode = await Battery.isLowPowerModeEnabledAsync();

      // Log performance data for analysis
      this.logPerformanceData();
    } catch (error) {
      console.error('Failed to update performance metrics:', error);
    }
  }

  private handleBatteryLevelChange(batteryLevel: number): void {
    // Trigger low battery callback if battery is below 15%
    if (batteryLevel <= 0.15 && this.onBatteryLowCallback) {
      this.onBatteryLowCallback(batteryLevel);
    }

    // Auto-enable power saving mode if battery is critically low (below 10%)
    if (batteryLevel <= 0.10) {
      this.enablePowerSavingMode();
    }
  }

  private handlePowerSavingModeChange(enabled: boolean): void {
    if (this.onPowerSavingModeCallback) {
      this.onPowerSavingModeCallback(enabled);
    }

    if (enabled) {
      this.applyPowerSavingOptimizations();
    } else {
      this.restoreNormalOperations();
    }
  }

  private handleAppStateChange(nextAppState: AppStateStatus): void {
    if (this.onAppStateChangeCallback) {
      this.onAppStateChangeCallback(nextAppState);
    }

    // Apply background optimizations when app goes to background
    if (nextAppState === 'background') {
      this.applyBackgroundOptimizations();
    } else if (nextAppState === 'active') {
      this.restoreFromBackground();
    }
  }

  private applyPowerSavingOptimizations(): void {
    // Reduce GPS update frequency
    this.powerSavingSettings.gpsUpdateInterval = Math.max(
      this.powerSavingSettings.gpsUpdateInterval * 2,
      5000 // Minimum 5 seconds
    );

    // Reduce TTS announcement frequency
    this.powerSavingSettings.ttsAnnouncementFrequency = Math.max(
      this.powerSavingSettings.ttsAnnouncementFrequency * 1.5,
      600000 // Minimum 10 minutes
    );

    // Disable non-essential features
    this.powerSavingSettings.backgroundSyncEnabled = false;
    this.powerSavingSettings.hapticFeedbackEnabled = false;

    this.saveSettings();
    console.log('Power saving optimizations applied');
  }

  private restoreNormalOperations(): void {
    // Restore normal GPS update frequency
    this.powerSavingSettings.gpsUpdateInterval = 1000;

    // Restore normal TTS announcement frequency
    this.powerSavingSettings.ttsAnnouncementFrequency = 300000; // 5 minutes

    // Re-enable features
    this.powerSavingSettings.backgroundSyncEnabled = true;
    this.powerSavingSettings.hapticFeedbackEnabled = true;

    this.saveSettings();
    console.log('Normal operations restored');
  }

  private applyBackgroundOptimizations(): void {
    // Increase GPS update interval for background operation
    this.currentMetrics.gpsUpdateFrequency = Math.max(
      this.powerSavingSettings.gpsUpdateInterval * 2,
      5000
    );

    console.log('Background optimizations applied');
  }

  private restoreFromBackground(): void {
    // Restore foreground GPS update frequency
    this.currentMetrics.gpsUpdateFrequency = this.powerSavingSettings.gpsUpdateInterval;

    console.log('Restored from background');
  }

  private logPerformanceData(): void {
    const performanceLog = {
      timestamp: new Date().toISOString(),
      batteryLevel: this.currentMetrics.batteryLevel,
      batteryState: this.currentMetrics.batteryState,
      isLowPowerMode: this.currentMetrics.isLowPowerMode,
      appState: this.appStateInfo.currentState,
      gpsUpdateFrequency: this.currentMetrics.gpsUpdateFrequency,
      foregroundTime: this.appStateInfo.foregroundTime,
      backgroundTime: this.appStateInfo.backgroundTime,
    };

    // Store performance logs (keep last 100 entries)
    const logs = this.getPerformanceLogs();
    logs.push(performanceLog);
    
    if (logs.length > 100) {
      logs.shift(); // Remove oldest entry
    }

    this.storage.set('performanceLogs', JSON.stringify(logs));
  }

  // Public methods

  getCurrentMetrics(): PerformanceMetrics {
    return { ...this.currentMetrics };
  }

  getAppStateInfo(): AppStateInfo {
    return { ...this.appStateInfo };
  }

  getPowerSavingSettings(): PowerSavingSettings {
    return { ...this.powerSavingSettings };
  }

  updatePowerSavingSettings(settings: Partial<PowerSavingSettings>): void {
    this.powerSavingSettings = { ...this.powerSavingSettings, ...settings };
    this.saveSettings();
  }

  enablePowerSavingMode(): void {
    this.applyPowerSavingOptimizations();
    if (this.onPowerSavingModeCallback) {
      this.onPowerSavingModeCallback(true);
    }
  }

  disablePowerSavingMode(): void {
    this.restoreNormalOperations();
    if (this.onPowerSavingModeCallback) {
      this.onPowerSavingModeCallback(false);
    }
  }

  getOptimalGpsUpdateInterval(): number {
    const { batteryLevel, isLowPowerMode } = this.currentMetrics;
    const { currentState } = this.appStateInfo;

    let interval = this.powerSavingSettings.gpsUpdateInterval;

    // Adjust based on battery level
    if (batteryLevel <= 0.15 || isLowPowerMode) {
      interval = Math.max(interval * 3, 5000); // 3x slower when low battery
    } else if (batteryLevel <= 0.30) {
      interval = Math.max(interval * 2, 2000); // 2x slower when moderate battery
    }

    // Adjust based on app state
    if (currentState === 'background') {
      interval = Math.max(interval * 2, 5000); // Slower in background
    }

    return interval;
  }

  getPerformanceLogs(): any[] {
    const logs = this.storage.getString('performanceLogs');
    if (logs) {
      try {
        return JSON.parse(logs);
      } catch (error) {
        console.error('Failed to parse performance logs:', error);
        return [];
      }
    }
    return [];
  }

  calculateBatteryUsageRate(): number {
    const logs = this.getPerformanceLogs();
    if (logs.length < 2) {
      return 0;
    }

    // Calculate battery usage over the last hour
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 3600000);
    
    const recentLogs = logs.filter(log => 
      new Date(log.timestamp) >= oneHourAgo
    );

    if (recentLogs.length < 2) {
      return 0;
    }

    const oldestLog = recentLogs[0];
    const newestLog = recentLogs[recentLogs.length - 1];
    
    const batteryDrop = oldestLog.batteryLevel - newestLog.batteryLevel;
    const timeDiff = (new Date(newestLog.timestamp).getTime() - 
                     new Date(oldestLog.timestamp).getTime()) / 3600000; // hours

    return timeDiff > 0 ? (batteryDrop / timeDiff) * 100 : 0; // Percentage per hour
  }

  // Callback setters
  onBatteryLow(callback: (level: number) => void): void {
    this.onBatteryLowCallback = callback;
  }

  onPowerSavingModeChange(callback: (enabled: boolean) => void): void {
    this.onPowerSavingModeCallback = callback;
  }

  onAppStateChange(callback: (state: AppStateStatus) => void): void {
    this.onAppStateChangeCallback = callback;
  }

  // Cleanup
  destroy(): void {
    if (this.batterySubscription) {
      this.batterySubscription.remove();
      this.batterySubscription = null;
    }

    if (this.appStateSubscription) {
      this.appStateSubscription.remove();
      this.appStateSubscription = null;
    }

    if (this.performanceMonitorInterval) {
      clearInterval(this.performanceMonitorInterval);
      this.performanceMonitorInterval = null;
    }
  }
}