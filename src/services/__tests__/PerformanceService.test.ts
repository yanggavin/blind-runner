import { PerformanceService } from '../PerformanceService';
import * as Battery from 'expo-battery';
import { AppState } from 'react-native';

// Mock dependencies
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

const mockBattery = Battery as jest.Mocked<typeof Battery>;
const mockAppState = AppState as jest.Mocked<typeof AppState>;

describe('PerformanceService', () => {
  let performanceService: PerformanceService;
  let mockStorage: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset singleton
    (PerformanceService as any).instance = undefined;
    
    // Mock battery functions
    mockBattery.getBatteryLevelAsync.mockResolvedValue(0.8);
    mockBattery.getBatteryStateAsync.mockResolvedValue(Battery.BatteryState.UNPLUGGED);
    mockBattery.isLowPowerModeEnabledAsync.mockResolvedValue(false);
    mockBattery.addBatteryLevelListener.mockReturnValue({ remove: jest.fn() });
    mockBattery.addLowPowerModeListener.mockReturnValue({ remove: jest.fn() });

    // Mock AppState
    mockAppState.addEventListener.mockReturnValue({ remove: jest.fn() });

    performanceService = PerformanceService.getInstance();
    mockStorage = (performanceService as any).storage;
  });

  afterEach(() => {
    performanceService.destroy();
  });

  describe('Battery Monitoring', () => {
    it('should initialize with current battery metrics', async () => {
      await new Promise(resolve => setTimeout(resolve, 100)); // Allow initialization
      
      const metrics = performanceService.getCurrentMetrics();
      
      expect(metrics.batteryLevel).toBe(0.8);
      expect(metrics.batteryState).toBe(Battery.BatteryState.UNPLUGGED);
      expect(metrics.isLowPowerMode).toBe(false);
    });

    it('should trigger low battery callback when battery drops below 15%', () => {
      const mockCallback = jest.fn();
      performanceService.onBatteryLow(mockCallback);

      // Simulate battery level change
      const batteryListener = mockBattery.addBatteryLevelListener.mock.calls[0][0];
      batteryListener({ batteryLevel: 0.1 });

      expect(mockCallback).toHaveBeenCalledWith(0.1);
    });

    it('should auto-enable power saving mode when battery is critically low', () => {
      const mockCallback = jest.fn();
      performanceService.onPowerSavingModeChange(mockCallback);

      // Simulate critical battery level
      const batteryListener = mockBattery.addBatteryLevelListener.mock.calls[0][0];
      batteryListener({ batteryLevel: 0.05 });

      expect(mockCallback).toHaveBeenCalledWith(true);
    });
  });

  describe('Power Saving Mode', () => {
    it('should apply power saving optimizations when enabled', () => {
      performanceService.enablePowerSavingMode();
      
      const settings = performanceService.getPowerSavingSettings();
      
      expect(settings.gpsUpdateInterval).toBeGreaterThan(1000);
      expect(settings.backgroundSyncEnabled).toBe(false);
      expect(settings.hapticFeedbackEnabled).toBe(false);
    });

    it('should restore normal operations when disabled', () => {
      // First enable power saving mode
      performanceService.enablePowerSavingMode();
      
      // Then disable it
      performanceService.disablePowerSavingMode();
      
      const settings = performanceService.getPowerSavingSettings();
      
      expect(settings.gpsUpdateInterval).toBe(1000);
      expect(settings.backgroundSyncEnabled).toBe(true);
      expect(settings.hapticFeedbackEnabled).toBe(true);
    });

    it('should update power saving settings', () => {
      const newSettings = {
        gpsUpdateInterval: 2000,
        ttsAnnouncementFrequency: 600000,
      };

      performanceService.updatePowerSavingSettings(newSettings);
      
      const settings = performanceService.getPowerSavingSettings();
      
      expect(settings.gpsUpdateInterval).toBe(2000);
      expect(settings.ttsAnnouncementFrequency).toBe(600000);
    });
  });

  describe('GPS Update Interval Optimization', () => {
    it('should return normal interval for good battery and active state', () => {
      // Mock good battery conditions
      (performanceService as any).currentMetrics = {
        batteryLevel: 0.8,
        isLowPowerMode: false,
      };
      (performanceService as any).appStateInfo = {
        currentState: 'active',
      };

      const interval = performanceService.getOptimalGpsUpdateInterval();
      
      expect(interval).toBe(1000); // Normal interval
    });

    it('should return longer interval for low battery', () => {
      // Mock low battery conditions
      (performanceService as any).currentMetrics = {
        batteryLevel: 0.1,
        isLowPowerMode: true,
      };
      (performanceService as any).appStateInfo = {
        currentState: 'active',
      };

      const interval = performanceService.getOptimalGpsUpdateInterval();
      
      expect(interval).toBeGreaterThan(3000); // Much longer interval
    });

    it('should return longer interval for background state', () => {
      // Mock background state
      (performanceService as any).currentMetrics = {
        batteryLevel: 0.8,
        isLowPowerMode: false,
      };
      (performanceService as any).appStateInfo = {
        currentState: 'background',
      };

      const interval = performanceService.getOptimalGpsUpdateInterval();
      
      expect(interval).toBeGreaterThan(2000); // Longer interval for background
    });
  });

  describe('Battery Usage Rate Calculation', () => {
    it('should calculate battery usage rate from performance logs', () => {
      const mockLogs = [
        {
          timestamp: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
          batteryLevel: 0.8,
        },
        {
          timestamp: new Date().toISOString(), // Now
          batteryLevel: 0.7,
        },
      ];

      mockStorage.getString.mockReturnValue(JSON.stringify(mockLogs));

      const usageRate = performanceService.calculateBatteryUsageRate();
      
      expect(usageRate).toBeCloseTo(10, 1); // 10% per hour
    });

    it('should return 0 when insufficient data', () => {
      mockStorage.getString.mockReturnValue(JSON.stringify([]));

      const usageRate = performanceService.calculateBatteryUsageRate();
      
      expect(usageRate).toBe(0);
    });
  });

  describe('App State Monitoring', () => {
    it('should track foreground and background time', () => {
      const appStateInfo = performanceService.getAppStateInfo();
      
      expect(appStateInfo.currentState).toBe('active');
      expect(typeof appStateInfo.foregroundTime).toBe('number');
      expect(typeof appStateInfo.backgroundTime).toBe('number');
    });

    it('should handle app state changes', () => {
      const mockCallback = jest.fn();
      performanceService.onAppStateChange(mockCallback);

      // Simulate app state change
      const appStateListener = mockAppState.addEventListener.mock.calls[0][1];
      appStateListener('background');

      expect(mockCallback).toHaveBeenCalledWith('background');
    });
  });

  describe('Performance Logging', () => {
    it('should log performance data periodically', async () => {
      // Wait for initial logging
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockStorage.set).toHaveBeenCalledWith(
        'performanceLogs',
        expect.any(String)
      );
    });

    it('should limit performance logs to 100 entries', () => {
      const existingLogs = Array(105).fill(null).map((_, i) => ({
        timestamp: new Date(Date.now() - i * 1000).toISOString(),
        batteryLevel: 0.8,
      }));

      mockStorage.getString.mockReturnValue(JSON.stringify(existingLogs));

      // Trigger logging
      (performanceService as any).logPerformanceData();

      const setCall = mockStorage.set.mock.calls.find(call => call[0] === 'performanceLogs');
      const savedLogs = JSON.parse(setCall[1]);
      
      expect(savedLogs.length).toBeLessThanOrEqual(100);
    });
  });

  describe('Memory Management', () => {
    it('should clean up resources on destroy', () => {
      const batterySubscription = { remove: jest.fn() };
      const appStateSubscription = { remove: jest.fn() };
      
      mockBattery.addBatteryLevelListener.mockReturnValue(batterySubscription);
      mockAppState.addEventListener.mockReturnValue(appStateSubscription);

      // Create new instance to get fresh subscriptions
      performanceService.destroy();
      const newService = PerformanceService.getInstance();
      newService.destroy();

      expect(batterySubscription.remove).toHaveBeenCalled();
      expect(appStateSubscription.remove).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle battery API errors gracefully', async () => {
      mockBattery.getBatteryLevelAsync.mockRejectedValue(new Error('Battery API error'));

      // Should not throw
      expect(() => {
        PerformanceService.getInstance();
      }).not.toThrow();
    });

    it('should handle storage errors gracefully', () => {
      mockStorage.getString.mockImplementation(() => {
        throw new Error('Storage error');
      });

      // Should not throw
      expect(() => {
        performanceService.calculateBatteryUsageRate();
      }).not.toThrow();
    });
  });
});