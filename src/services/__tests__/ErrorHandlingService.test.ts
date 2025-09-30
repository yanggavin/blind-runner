import { ErrorHandlingService, ErrorType } from '../ErrorHandlingService';
import { TTSServiceImpl } from '../TTSService';
import { HapticServiceImpl } from '../HapticService';

// Mock the services
jest.mock('../TTSService');
jest.mock('../HapticService');

describe('ErrorHandlingService', () => {
  let errorHandler: ErrorHandlingService;
  let mockTTSService: jest.Mocked<TTSServiceImpl>;
  let mockHapticService: jest.Mocked<HapticServiceImpl>;

  beforeEach(() => {
    errorHandler = ErrorHandlingService.getInstance();
    mockTTSService = new TTSServiceImpl() as jest.Mocked<TTSServiceImpl>;
    mockHapticService = new HapticServiceImpl() as jest.Mocked<HapticServiceImpl>;
    
    // Mock the speak method
    mockTTSService.speak = jest.fn().mockResolvedValue(undefined);
    mockHapticService.errorFeedback = jest.fn().mockResolvedValue(undefined);
    
    errorHandler.setServices(mockTTSService, mockHapticService);
    
    // Clear error history before each test
    errorHandler.clearErrorHistory();
  });

  afterEach(() => {
    errorHandler.cleanup();
  });

  describe('Error Handling', () => {
    it('should handle GPS signal lost error', async () => {
      const mockLocationService = {
        startTracking: jest.fn().mockResolvedValue(undefined)
      };

      await errorHandler.reportGPSSignalLost(mockLocationService);

      const errorHistory = errorHandler.getErrorHistory();
      expect(errorHistory).toHaveLength(1);
      expect(errorHistory[0].type).toBe(ErrorType.GPS_SIGNAL_LOST);
      expect(errorHistory[0].recoverable).toBe(true);
      expect(mockTTSService.speak).toHaveBeenCalledWith(
        'GPS signal lost. Continuing time tracking.',
        expect.any(String)
      );
    });

    it('should handle GPS permission denied error', async () => {
      await errorHandler.reportGPSPermissionDenied();

      const errorHistory = errorHandler.getErrorHistory();
      expect(errorHistory).toHaveLength(1);
      expect(errorHistory[0].type).toBe(ErrorType.GPS_PERMISSION_DENIED);
      expect(errorHistory[0].recoverable).toBe(false);
      expect(mockTTSService.speak).toHaveBeenCalledWith(
        'Location permission required. Please enable in settings.',
        expect.any(String)
      );
    });

    it('should handle TTS engine unavailable error', async () => {
      await errorHandler.reportTTSEngineUnavailable();

      const errorHistory = errorHandler.getErrorHistory();
      expect(errorHistory).toHaveLength(1);
      expect(errorHistory[0].type).toBe(ErrorType.TTS_ENGINE_UNAVAILABLE);
      expect(errorHistory[0].recoverable).toBe(true);
    });

    it('should handle haptic engine unavailable error', async () => {
      await errorHandler.reportHapticEngineUnavailable();

      const errorHistory = errorHistory.getErrorHistory();
      expect(errorHistory).toHaveLength(1);
      expect(errorHistory[0].type).toBe(ErrorType.HAPTIC_ENGINE_UNAVAILABLE);
      expect(errorHistory[0].fallbackAvailable).toBe(true);
    });

    it('should handle database errors with retry logic', async () => {
      const mockDatabaseService = {
        initialize: jest.fn().mockResolvedValue(undefined)
      };
      const dbError = new Error('Database connection failed');

      await errorHandler.reportDatabaseError(dbError, mockDatabaseService);

      const errorHistory = errorHandler.getErrorHistory();
      expect(errorHistory).toHaveLength(1);
      expect(errorHistory[0].type).toBe(ErrorType.DATABASE_ERROR);
      expect(errorHistory[0].recoverable).toBe(true);
    });

    it('should handle storage full error', async () => {
      await errorHandler.reportStorageFull();

      const errorHistory = errorHandler.getErrorHistory();
      expect(errorHistory).toHaveLength(1);
      expect(errorHistory[0].type).toBe(ErrorType.STORAGE_FULL);
      expect(errorHistory[0].recoverable).toBe(false);
      expect(mockTTSService.speak).toHaveBeenCalledWith(
        'Storage full. Please delete old runs or export data.',
        expect.any(String)
      );
    });
  });

  describe('Recovery Mechanisms', () => {
    it('should attempt recovery for recoverable errors', async () => {
      const mockLocationService = {
        startTracking: jest.fn().mockResolvedValue(undefined)
      };

      await errorHandler.reportGPSSignalLost(mockLocationService);

      // Wait for recovery attempt
      await new Promise(resolve => setTimeout(resolve, 100));

      // Recovery should be attempted (mocked to succeed)
      expect(mockLocationService.startTracking).toHaveBeenCalled();
    });

    it('should use fallback for non-recoverable errors', async () => {
      await errorHandler.reportGPSPermissionDenied();

      const errorHistory = errorHandler.getErrorHistory();
      expect(errorHistory[0].recoverable).toBe(false);
      expect(errorHistory[0].fallbackAvailable).toBe(true);
    });

    it('should track retry attempts', async () => {
      const mockDatabaseService = {
        initialize: jest.fn().mockRejectedValue(new Error('Still failing'))
      };
      const dbError = new Error('Database connection failed');

      // First attempt
      await errorHandler.reportDatabaseError(dbError, mockDatabaseService);
      
      // Wait for retry attempts
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Should have attempted retries
      expect(mockDatabaseService.initialize).toHaveBeenCalled();
    });
  });

  describe('Error History', () => {
    it('should maintain error history', async () => {
      await errorHandler.reportGPSSignalLost();
      await errorHandler.reportTTSEngineUnavailable();
      await errorHandler.reportHapticEngineUnavailable();

      const errorHistory = errorHandler.getErrorHistory();
      expect(errorHistory).toHaveLength(3);
      expect(errorHistory.map(e => e.type)).toEqual([
        ErrorType.GPS_SIGNAL_LOST,
        ErrorType.TTS_ENGINE_UNAVAILABLE,
        ErrorType.HAPTIC_ENGINE_UNAVAILABLE
      ]);
    });

    it('should limit error history size', async () => {
      // Add more than 100 errors
      for (let i = 0; i < 105; i++) {
        await errorHandler.reportNetworkUnavailable();
      }

      const errorHistory = errorHandler.getErrorHistory();
      expect(errorHistory).toHaveLength(100);
    });

    it('should filter recent errors', async () => {
      await errorHandler.reportGPSSignalLost();
      
      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 100));
      
      await errorHandler.reportTTSEngineUnavailable();

      const recentErrors = errorHandler.getRecentErrors(1); // Last 1 minute
      expect(recentErrors).toHaveLength(2);
    });

    it('should clear error history', async () => {
      await errorHandler.reportGPSSignalLost();
      await errorHandler.reportTTSEngineUnavailable();

      errorHandler.clearErrorHistory();

      const errorHistory = errorHandler.getErrorHistory();
      expect(errorHistory).toHaveLength(0);
    });
  });

  describe('Fallback Notifications', () => {
    it('should fall back to haptic when TTS fails', async () => {
      // Mock TTS to fail
      mockTTSService.speak.mockRejectedValue(new Error('TTS failed'));

      await errorHandler.reportGPSSignalLost();

      // Should attempt haptic fallback for high priority messages
      expect(mockHapticService.errorFeedback).toHaveBeenCalled();
    });

    it('should log as final fallback when both TTS and haptic fail', async () => {
      // Mock both services to fail
      mockTTSService.speak.mockRejectedValue(new Error('TTS failed'));
      mockHapticService.errorFeedback.mockRejectedValue(new Error('Haptic failed'));

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      await errorHandler.reportGPSSignalLost();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('User notification:')
      );

      consoleSpy.mockRestore();
    });
  });

  describe('Cleanup', () => {
    it('should cleanup active recovery timers', async () => {
      await errorHandler.reportGPSSignalLost();

      // Cleanup should clear timers
      errorHandler.cleanup();

      // No way to directly test timer cleanup, but it should not throw
      expect(() => errorHandler.cleanup()).not.toThrow();
    });
  });
});