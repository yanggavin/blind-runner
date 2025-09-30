import { BackgroundTaskManager } from '../BackgroundTaskManager';
import { AppState } from 'react-native';
import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';

// Mock dependencies
jest.mock('react-native', () => ({
  AppState: {
    currentState: 'active',
    addEventListener: jest.fn(),
  },
}));

jest.mock('expo-task-manager', () => ({
  defineTask: jest.fn(),
  isTaskRegisteredAsync: jest.fn(),
}));

jest.mock('expo-background-fetch', () => ({
  registerTaskAsync: jest.fn(),
  BackgroundFetchResult: {
    NewData: 'newData',
    Failed: 'failed',
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

jest.mock('../../database/DatabaseService', () => ({
  DatabaseService: {
    getInstance: jest.fn().mockResolvedValue({
      updateRun: jest.fn(),
      getActiveRun: jest.fn(),
    }),
  },
}));

jest.mock('../LocationService', () => ({
  LocationServiceImpl: jest.fn().mockImplementation(() => ({
    startTracking: jest.fn(),
    stopTracking: jest.fn(),
  })),
}));

jest.mock('../RunTrackingService', () => ({
  RunTrackingServiceImpl: jest.fn().mockImplementation(() => ({
    isRunning: jest.fn().mockReturnValue(false),
    isPaused: jest.fn().mockReturnValue(false),
    getCurrentMetrics: jest.fn().mockReturnValue({
      distance: 0,
      duration: 0,
    }),
    restoreActiveRun: jest.fn().mockResolvedValue(false),
  })),
}));

const mockAppState = AppState as jest.Mocked<typeof AppState>;
const mockTaskManager = TaskManager as jest.Mocked<typeof TaskManager>;
const mockBackgroundFetch = BackgroundFetch as jest.Mocked<typeof BackgroundFetch>;

describe('BackgroundTaskManager', () => {
  let backgroundTaskManager: BackgroundTaskManager;
  let mockStorage: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset singleton
    (BackgroundTaskManager as any).instance = undefined;
    
    // Mock TaskManager
    mockTaskManager.isTaskRegisteredAsync.mockResolvedValue(false);
    
    // Mock AppState
    mockAppState.addEventListener.mockReturnValue({ remove: jest.fn() });

    backgroundTaskManager = BackgroundTaskManager.getInstance();
    mockStorage = (backgroundTaskManager as any).storage;
  });

  afterEach(() => {
    backgroundTaskManager.destroy();
  });

  describe('Initialization', () => {
    it('should initialize services and register background tasks', async () => {
      await new Promise(resolve => setTimeout(resolve, 100)); // Allow async initialization

      expect(mockTaskManager.defineTask).toHaveBeenCalled();
      expect(mockBackgroundFetch.registerTaskAsync).toHaveBeenCalled();
    });

    it('should set up app state monitoring', () => {
      expect(mockAppState.addEventListener).toHaveBeenCalledWith(
        'change',
        expect.any(Function)
      );
    });
  });

  describe('App State Management', () => {
    it('should save app state when going to background', async () => {
      const appStateListener = mockAppState.addEventListener.mock.calls[0][1];
      
      // Simulate app going to background
      appStateListener('background');

      await new Promise(resolve => setTimeout(resolve, 50)); // Allow async operations

      expect(mockStorage.set).toHaveBeenCalledWith(
        'app_state_data',
        expect.any(String)
      );
    });

    it('should restore app state when coming to foreground', async () => {
      const mockAppStateData = {
        activeRunId: 123,
        runStartTime: new Date().toISOString(),
        isPaused: false,
        lastSaveTime: new Date().toISOString(),
        appVersion: '1.0.0',
      };

      mockStorage.getString.mockReturnValue(JSON.stringify(mockAppStateData));

      const appStateListener = mockAppState.addEventListener.mock.calls[0][1];
      
      // Simulate app coming to foreground
      (backgroundTaskManager as any).currentAppState = 'background';
      appStateListener('active');

      await new Promise(resolve => setTimeout(resolve, 50)); // Allow async operations

      // Should attempt to restore state
      expect(mockStorage.getString).toHaveBeenCalledWith('app_state_data');
    });

    it('should execute foreground restore callbacks', async () => {
      const mockCallback = jest.fn();
      backgroundTaskManager.addForegroundRestoreCallback(mockCallback);

      const appStateListener = mockAppState.addEventListener.mock.calls[0][1];
      
      // Simulate app coming to foreground
      (backgroundTaskManager as any).currentAppState = 'background';
      appStateListener('active');

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(mockCallback).toHaveBeenCalled();
    });
  });

  describe('App State Data Management', () => {
    it('should save and retrieve app state data', () => {
      const testData = {
        activeRunId: 456,
        runStartTime: new Date(),
        isPaused: true,
        lastSaveTime: new Date(),
        appVersion: '1.0.0',
      };

      mockStorage.getString.mockReturnValue(JSON.stringify(testData));

      const retrievedData = backgroundTaskManager.getAppStateData();

      expect(retrievedData).toEqual(expect.objectContaining({
        activeRunId: 456,
        isPaused: true,
        appVersion: '1.0.0',
      }));
    });

    it('should clear app state data', () => {
      backgroundTaskManager.clearAppState();

      expect(mockStorage.delete).toHaveBeenCalledWith('app_state_data');
    });

    it('should handle corrupted app state data gracefully', () => {
      mockStorage.getString.mockReturnValue('invalid json');

      const retrievedData = backgroundTaskManager.getAppStateData();

      expect(retrievedData).toBeNull();
    });
  });

  describe('Background Task Information', () => {
    it('should return background task info', async () => {
      mockTaskManager.isTaskRegisteredAsync.mockResolvedValue(true);
      mockStorage.getNumber.mockReturnValue(5);
      mockStorage.getString.mockReturnValue(new Date().toISOString());

      const taskInfo = await backgroundTaskManager.getBackgroundTaskInfo();

      expect(taskInfo).toHaveLength(1);
      expect(taskInfo[0]).toEqual(expect.objectContaining({
        taskName: 'background-sync-task',
        isRegistered: true,
        executionCount: 5,
        status: 'active',
      }));
    });

    it('should handle task info retrieval errors', async () => {
      mockTaskManager.isTaskRegisteredAsync.mockRejectedValue(new Error('Task error'));

      const taskInfo = await backgroundTaskManager.getBackgroundTaskInfo();

      expect(taskInfo).toEqual([]);
    });
  });

  describe('App Kill Recovery', () => {
    it('should detect when app kill recovery is needed', async () => {
      const oldTime = new Date(Date.now() - 10 * 60 * 1000); // 10 minutes ago
      const mockAppStateData = {
        activeRunId: 789,
        runStartTime: new Date().toISOString(),
        isPaused: false,
        lastSaveTime: oldTime.toISOString(),
        appVersion: '1.0.0',
      };

      mockStorage.getString.mockReturnValue(JSON.stringify(mockAppStateData));

      const recoveryNeeded = await backgroundTaskManager.isAppKilledRecoveryNeeded();

      expect(recoveryNeeded).toBe(true);
    });

    it('should not need recovery for recent saves', async () => {
      const recentTime = new Date(Date.now() - 1 * 60 * 1000); // 1 minute ago
      const mockAppStateData = {
        activeRunId: 789,
        runStartTime: new Date().toISOString(),
        isPaused: false,
        lastSaveTime: recentTime.toISOString(),
        appVersion: '1.0.0',
      };

      mockStorage.getString.mockReturnValue(JSON.stringify(mockAppStateData));

      const recoveryNeeded = await backgroundTaskManager.isAppKilledRecoveryNeeded();

      expect(recoveryNeeded).toBe(false);
    });

    it('should perform app kill recovery', async () => {
      const mockAppStateData = {
        activeRunId: 999,
        runStartTime: new Date().toISOString(),
        isPaused: false,
        lastSaveTime: new Date().toISOString(),
        appVersion: '1.0.0',
      };

      mockStorage.getString.mockReturnValue(JSON.stringify(mockAppStateData));

      const mockDatabaseService = {
        updateRun: jest.fn().mockResolvedValue(undefined),
      };
      (backgroundTaskManager as any).databaseService = mockDatabaseService;

      const recoveryResult = await backgroundTaskManager.performAppKilledRecovery();

      expect(recoveryResult).toBe(true);
      expect(mockDatabaseService.updateRun).toHaveBeenCalledWith(999, {
        status: 'interrupted',
      });
    });
  });

  describe('Callback Management', () => {
    it('should add and remove foreground restore callbacks', () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();

      backgroundTaskManager.addForegroundRestoreCallback(callback1);
      backgroundTaskManager.addForegroundRestoreCallback(callback2);

      expect((backgroundTaskManager as any).foregroundRestoreCallbacks).toHaveLength(2);

      backgroundTaskManager.removeForegroundRestoreCallback(callback1);

      expect((backgroundTaskManager as any).foregroundRestoreCallbacks).toHaveLength(1);
      expect((backgroundTaskManager as any).foregroundRestoreCallbacks[0]).toBe(callback2);
    });

    it('should handle callback errors gracefully', async () => {
      const errorCallback = jest.fn().mockImplementation(() => {
        throw new Error('Callback error');
      });
      const normalCallback = jest.fn();

      backgroundTaskManager.addForegroundRestoreCallback(errorCallback);
      backgroundTaskManager.addForegroundRestoreCallback(normalCallback);

      const appStateListener = mockAppState.addEventListener.mock.calls[0][1];
      
      // Simulate app coming to foreground
      (backgroundTaskManager as any).currentAppState = 'background';
      appStateListener('active');

      await new Promise(resolve => setTimeout(resolve, 50));

      // Both callbacks should have been called despite the error
      expect(errorCallback).toHaveBeenCalled();
      expect(normalCallback).toHaveBeenCalled();
    });
  });

  describe('Force App State Restore', () => {
    it('should force app state restore', async () => {
      const mockAppStateData = {
        activeRunId: 111,
        runStartTime: new Date().toISOString(),
        isPaused: false,
        lastSaveTime: new Date().toISOString(),
        appVersion: '1.0.0',
      };

      mockStorage.getString.mockReturnValue(JSON.stringify(mockAppStateData));

      const mockRunTrackingService = {
        restoreActiveRun: jest.fn().mockResolvedValue(true),
      };
      (backgroundTaskManager as any).runTrackingService = mockRunTrackingService;

      const result = await backgroundTaskManager.forceAppStateRestore();

      expect(result).toBe(true);
      expect(mockRunTrackingService.restoreActiveRun).toHaveBeenCalled();
    });
  });

  describe('Cleanup', () => {
    it('should clean up resources on destroy', () => {
      const appStateSubscription = { remove: jest.fn() };
      mockAppState.addEventListener.mockReturnValue(appStateSubscription);

      // Create new instance to get fresh subscription
      backgroundTaskManager.destroy();
      const newManager = BackgroundTaskManager.getInstance();
      newManager.destroy();

      expect(appStateSubscription.remove).toHaveBeenCalled();
    });
  });
});