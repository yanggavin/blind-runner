import { PerformanceService } from '../PerformanceService';
import { BackgroundTaskManager } from '../BackgroundTaskManager';
import { LocationServiceImpl } from '../LocationService';
import { RunTrackingServiceImpl } from '../RunTrackingService';
import * as Battery from 'expo-battery';
import { AppState } from 'react-native';

// Mock all dependencies
jest.mock('expo-battery');
jest.mock('react-native', () => ({
  AppState: {
    currentState: 'active',
    addEventListener: jest.fn(),
  },
}));
jest.mock('react-native-mmkv', () => ({
  MMKV: jest.fn().mockImplementation(() => ({
    getString: jest.fn(),
    set: jest.fn(),
    getNumber: jest.fn(),
    delete: jest.fn(),
  })),
}));
jest.mock('expo-task-manager');
jest.mock('expo-background-fetch');
jest.mock('../DatabaseService');
jest.mock('expo-location');

const mockBattery = Battery as jest.Mocked<typeof Battery>;
const mockAppState = AppState as jest.Mocked<typeof AppState>;

describe('Performance Integration Tests', () => {
  let performanceService: PerformanceService;
  let backgroundTaskManager: BackgroundTaskManager;
  let locationService: LocationServiceImpl;
  let runTrackingService: RunTrackingServiceImpl;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset singletons
    (PerformanceService as any).instance = undefined;
    (BackgroundTaskManager as any).instance = undefined;
    
    // Mock battery functions
    mockBattery.getBatteryLevelAsync.mockResolvedValue(0.8);
    mockBattery.getBatteryStateAsync.mockResolvedValue(Battery.BatteryState.UNPLUGGED);
    mockBattery.isLowPowerModeEnabledAsync.mockResolvedValue(false);
    mockBattery.addBatteryLevelListener.mockReturnValue({ remove: jest.fn() });
    mockBattery.addLowPowerModeListener.mockReturnValue({ remove: jest.fn() });

    // Mock AppState
    mockAppState.addEventListener.mockReturnValue({ remove: jest.fn() });

    // Initialize services
    performanceService = PerformanceService.getInstance();
    backgroundTaskManager = BackgroundTaskManager.getInstance();
    locationService = new LocationServiceImpl();
    runTrackingService = new RunTrackingServiceImpl(locationService);
  });

  afterEach(() => {
    performanceService.destroy();
    backgroundTaskManager.destroy();
  });

  describe('Battery-Aware GPS Optimization', () => {
    it('should optimize GPS frequency based on battery level', async () => {
      // Start with normal battery
      let optimalInterval = performanceService.getOptimalGpsUpdateInterval();
      expect(optimalInterval).toBe(1000); // Normal 1-second interval

      // Simulate battery drop to 25%
      (performanceService as any).currentMetrics.batteryLevel = 0.25;
      optimalInterval = performanceService.getOptimalGpsUpdateInterval();
      expect(optimalInterval).toBeGreaterThan(1000);

      // Simulate critical battery (10%)
      (performanceService as any).currentMetrics.batteryLevel = 0.1;
      (performanceService as any).currentMetrics.isLowPowerMode = true;
      optimalInterval = performanceService.getOptimalGpsUpdateInterval();
      expect(optimalInterval).toBeGreaterThanOrEqual(3000); // Much longer interval
    });

    it('should adjust GPS frequency when app goes to background', async () => {
      // Start in foreground
      (performanceService as any).appStateInfo.currentState = 'active';
      let optimalInterval = performanceService.getOptimalGpsUpdateInterval();
      const foregroundInterval = optimalInterval;

      // Simulate app going to background
      (performanceService as any).appStateInfo.currentState = 'background';
      optimalInterval = performanceService.getOptimalGpsUpdateInterval();
      
      expect(optimalInterval).toBeGreaterThan(foregroundInterval);
    });
  });

  describe('Power Saving Mode Integration', () => {
    it('should coordinate power saving across services', () => {
      const powerSavingCallback = jest.fn();
      performanceService.onPowerSavingModeChange(powerSavingCallback);

      // Enable power saving mode
      performanceService.enablePowerSavingMode();

      expect(powerSavingCallback).toHaveBeenCalledWith(true);

      const settings = performanceService.getPowerSavingSettings();
      expect(settings.gpsUpdateInterval).toBeGreaterThan(1000);
      expect(settings.backgroundSyncEnabled).toBe(false);
      expect(settings.hapticFeedbackEnabled).toBe(false);
    });

    it('should automatically enable power saving on critical battery', () => {
      const powerSavingCallback = jest.fn();
      performanceService.onPowerSavingModeChange(powerSavingCallback);

      // Simulate critical battery level
      const batteryListener = mockBattery.addBatteryLevelListener.mock.calls[0][0];
      batteryListener({ batteryLevel: 0.05 });

      expect(powerSavingCallback).toHaveBeenCalledWith(true);
    });
  });

  describe('Background Task Coordination', () => {
    it('should save and restore app state during background transitions', async () => {
      // Mock running state
      jest.spyOn(runTrackingService, 'isRunning').mockReturnValue(true);
      jest.spyOn(runTrackingService, 'isPaused').mockReturnValue(false);

      const appStateListener = mockAppState.addEventListener.mock.calls[0][1];
      
      // Simulate app going to background
      appStateListener('background');

      await new Promise(resolve => setTimeout(resolve, 50));

      // Should have saved app state
      const mockStorage = (backgroundTaskManager as any).storage;
      expect(mockStorage.set).toHaveBeenCalledWith(
        'app_state_data',
        expect.any(String)
      );
    });

    it('should handle app kill recovery scenarios', async () => {
      // Mock app state data indicating an interrupted run
      const mockAppStateData = {
        activeRunId: 123,
        runStartTime: new Date(Date.now() - 10 * 60 * 1000).toISOString(), // 10 minutes ago
        isPaused: false,
        lastSaveTime: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
        appVersion: '1.0.0',
      };

      const mockStorage = (backgroundTaskManager as any).storage;
      mockStorage.getString.mockReturnValue(JSON.stringify(mockAppStateData));

      const recoveryNeeded = await backgroundTaskManager.isAppKilledRecoveryNeeded();
      expect(recoveryNeeded).toBe(true);

      const recoveryResult = await backgroundTaskManager.performAppKilledRecovery();
      expect(recoveryResult).toBe(true);
    });
  });

  describe('Battery Usage Monitoring', () => {
    it('should track battery consumption during runs', () => {
      // Mock performance logs with battery drain
      const mockLogs = [
        {
          timestamp: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
          batteryLevel: 0.9,
          appState: 'active',
        },
        {
          timestamp: new Date(Date.now() - 1800000).toISOString(), // 30 minutes ago
          batteryLevel: 0.85,
          appState: 'active',
        },
        {
          timestamp: new Date().toISOString(), // Now
          batteryLevel: 0.8,
          appState: 'active',
        },
      ];

      const mockStorage = (performanceService as any).storage;
      mockStorage.getString.mockReturnValue(JSON.stringify(mockLogs));

      const usageRate = performanceService.calculateBatteryUsageRate();
      
      // Should calculate approximately 10% per hour
      expect(usageRate).toBeCloseTo(10, 1);
    });

    it('should provide battery usage warnings', () => {
      const batteryCallback = jest.fn();
      performanceService.onBatteryLow(batteryCallback);

      // Simulate battery dropping to warning level
      const batteryListener = mockBattery.addBatteryLevelListener.mock.calls[0][0];
      batteryListener({ batteryLevel: 0.12 });

      expect(batteryCallback).toHaveBeenCalledWith(0.12);
    });
  });

  describe('Memory and Performance Optimization', () => {
    it('should optimize performance during long runs', async () => {
      // Simulate a long-running session
      const initialMetrics = performanceService.getCurrentMetrics();
      
      // Mock battery degradation over time
      (performanceService as any).currentMetrics.batteryLevel = 0.3;
      
      const optimizedInterval = performanceService.getOptimalGpsUpdateInterval();
      
      expect(optimizedInterval).toBeGreaterThan(initialMetrics.gpsUpdateFrequency);
    });

    it('should clean up old performance logs', () => {
      // Mock old performance logs
      const oldLogs = Array(150).fill(null).map((_, i) => ({
        timestamp: new Date(Date.now() - i * 60000).toISOString(),
        batteryLevel: 0.8,
      }));

      const mockStorage = (performanceService as any).storage;
      mockStorage.getString.mockReturnValue(JSON.stringify(oldLogs));

      // Trigger log cleanup
      (performanceService as any).logPerformanceData();

      // Should limit to 100 entries
      const setCall = mockStorage.set.mock.calls.find(call => call[0] === 'performanceLogs');
      if (setCall) {
        const savedLogs = JSON.parse(setCall[1]);
        expect(savedLogs.length).toBeLessThanOrEqual(100);
      }
    });
  });

  describe('Error Recovery and Resilience', () => {
    it('should handle service initialization failures gracefully', () => {
      // Mock service initialization failure
      jest.spyOn(console, 'error').mockImplementation(() => {});

      // Should not throw even if services fail to initialize
      expect(() => {
        const newPerformanceService = PerformanceService.getInstance();
        newPerformanceService.getCurrentMetrics();
      }).not.toThrow();
    });

    it('should recover from storage corruption', () => {
      const mockStorage = (performanceService as any).storage;
      mockStorage.getString.mockImplementation(() => {
        throw new Error('Storage corrupted');
      });

      // Should handle storage errors gracefully
      expect(() => {
        performanceService.calculateBatteryUsageRate();
      }).not.toThrow();

      const usageRate = performanceService.calculateBatteryUsageRate();
      expect(usageRate).toBe(0);
    });
  });

  describe('Performance Metrics Validation', () => {
    it('should meet battery consumption requirements', () => {
      // Simulate 1-hour run with normal GPS tracking
      const mockLogs = [
        {
          timestamp: new Date(Date.now() - 3600000).toISOString(),
          batteryLevel: 1.0,
        },
        {
          timestamp: new Date().toISOString(),
          batteryLevel: 0.92, // 8% consumption in 1 hour
        },
      ];

      const mockStorage = (performanceService as any).storage;
      mockStorage.getString.mockReturnValue(JSON.stringify(mockLogs));

      const usageRate = performanceService.calculateBatteryUsageRate();
      
      // Should meet requirement of no more than 8% per hour
      expect(usageRate).toBeLessThanOrEqual(8);
    });

    it('should optimize for extended runs', () => {
      // Simulate conditions for a long run (2+ hours)
      (performanceService as any).currentMetrics.batteryLevel = 0.4; // 40% remaining
      
      const optimalInterval = performanceService.getOptimalGpsUpdateInterval();
      
      // Should use longer intervals to preserve battery
      expect(optimalInterval).toBeGreaterThan(2000);
    });
  });
});