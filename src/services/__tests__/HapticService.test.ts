import { HapticServiceImpl } from '../HapticService';
import { VibrationPattern } from '../interfaces';

// Mock expo-haptics
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: {
    Light: 'light',
    Medium: 'medium',
    Heavy: 'heavy',
  },
  NotificationFeedbackType: {
    Success: 'success',
    Warning: 'warning',
    Error: 'error',
  },
}));

const mockImpactAsync = require('expo-haptics').impactAsync as jest.MockedFunction<any>;
const mockNotificationAsync = require('expo-haptics').notificationAsync as jest.MockedFunction<any>;

describe('HapticService', () => {
  let hapticService: HapticServiceImpl;

  beforeEach(() => {
    hapticService = new HapticServiceImpl();
    jest.clearAllMocks();
    
    // Mock successful haptic feedback
    mockImpactAsync.mockResolvedValue(undefined);
    mockNotificationAsync.mockResolvedValue(undefined);
  });

  describe('basic vibration patterns', () => {
    it('should execute kilometer pattern', async () => {
      await hapticService.vibrate(VibrationPattern.KILOMETER);
      
      // Should have 3 heavy impacts for kilometer milestone
      expect(mockImpactAsync).toHaveBeenCalledTimes(3);
      expect(mockImpactAsync).toHaveBeenCalledWith('heavy');
    });

    it('should execute half kilometer pattern', async () => {
      await hapticService.vibrate(VibrationPattern.HALF_KILOMETER);
      
      // Should have 2 medium impacts for half kilometer milestone
      expect(mockImpactAsync).toHaveBeenCalledTimes(2);
      expect(mockImpactAsync).toHaveBeenCalledWith('medium');
    });

    it('should execute start confirmation pattern', async () => {
      await hapticService.vibrate(VibrationPattern.START_CONFIRMATION);
      
      // Should have 1 heavy impact for start confirmation
      expect(mockImpactAsync).toHaveBeenCalledTimes(1);
      expect(mockImpactAsync).toHaveBeenCalledWith('heavy');
    });

    it('should execute pause confirmation pattern', async () => {
      await hapticService.vibrate(VibrationPattern.PAUSE_CONFIRMATION);
      
      // Should have 2 medium impacts for pause confirmation
      expect(mockImpactAsync).toHaveBeenCalledTimes(2);
      expect(mockImpactAsync).toHaveBeenCalledWith('medium');
    });

    it('should execute resume confirmation pattern', async () => {
      await hapticService.vibrate(VibrationPattern.RESUME_CONFIRMATION);
      
      // Should have 1 medium impact for resume confirmation
      expect(mockImpactAsync).toHaveBeenCalledTimes(1);
      expect(mockImpactAsync).toHaveBeenCalledWith('medium');
    });

    it('should execute stop confirmation pattern', async () => {
      await hapticService.vibrate(VibrationPattern.STOP_CONFIRMATION);
      
      // Should have 1 heavy + 2 light impacts for stop confirmation
      expect(mockImpactAsync).toHaveBeenCalledTimes(3);
      expect(mockImpactAsync).toHaveBeenNthCalledWith(1, 'heavy');
      expect(mockImpactAsync).toHaveBeenNthCalledWith(2, 'light');
      expect(mockImpactAsync).toHaveBeenNthCalledWith(3, 'light');
    });

    it('should execute button press pattern', async () => {
      await hapticService.vibrate(VibrationPattern.BUTTON_PRESS);
      
      // Should have 1 light impact for button press
      expect(mockImpactAsync).toHaveBeenCalledTimes(1);
      expect(mockImpactAsync).toHaveBeenCalledWith('light');
    });

    it('should execute error pattern', async () => {
      await hapticService.vibrate(VibrationPattern.ERROR);
      
      // Should use notification feedback for error
      expect(mockNotificationAsync).toHaveBeenCalledTimes(1);
      expect(mockNotificationAsync).toHaveBeenCalledWith('error');
    });

    it('should execute success pattern', async () => {
      await hapticService.vibrate(VibrationPattern.SUCCESS);
      
      // Should use notification feedback for success
      expect(mockNotificationAsync).toHaveBeenCalledTimes(1);
      expect(mockNotificationAsync).toHaveBeenCalledWith('success');
    });

    it('should execute warning pattern', async () => {
      await hapticService.vibrate(VibrationPattern.WARNING);
      
      // Should use notification feedback for warning
      expect(mockNotificationAsync).toHaveBeenCalledTimes(1);
      expect(mockNotificationAsync).toHaveBeenCalledWith('warning');
    });

    it('should execute time milestone pattern when enabled', async () => {
      hapticService.setTimeBasedEnabled(true);
      
      await hapticService.vibrate(VibrationPattern.TIME_MILESTONE);
      
      // Should have 1 medium impact for time milestone
      expect(mockImpactAsync).toHaveBeenCalledTimes(1);
      expect(mockImpactAsync).toHaveBeenCalledWith('medium');
    });
  });

  describe('milestone methods', () => {
    it('should trigger kilometer milestone vibration', async () => {
      await hapticService.kilometerMilestone();
      
      expect(mockImpactAsync).toHaveBeenCalledTimes(3);
      expect(mockImpactAsync).toHaveBeenCalledWith('heavy');
    });

    it('should trigger half kilometer milestone vibration', async () => {
      await hapticService.halfKilometerMilestone();
      
      expect(mockImpactAsync).toHaveBeenCalledTimes(2);
      expect(mockImpactAsync).toHaveBeenCalledWith('medium');
    });

    it('should trigger run start confirmation', async () => {
      await hapticService.runStartConfirmation();
      
      expect(mockImpactAsync).toHaveBeenCalledTimes(1);
      expect(mockImpactAsync).toHaveBeenCalledWith('heavy');
    });

    it('should trigger run pause confirmation', async () => {
      await hapticService.runPauseConfirmation();
      
      expect(mockImpactAsync).toHaveBeenCalledTimes(2);
      expect(mockImpactAsync).toHaveBeenCalledWith('medium');
    });

    it('should trigger run resume confirmation', async () => {
      await hapticService.runResumeConfirmation();
      
      expect(mockImpactAsync).toHaveBeenCalledTimes(1);
      expect(mockImpactAsync).toHaveBeenCalledWith('medium');
    });

    it('should trigger run stop confirmation', async () => {
      await hapticService.runStopConfirmation();
      
      expect(mockImpactAsync).toHaveBeenCalledTimes(3);
    });

    it('should trigger time milestone vibration when enabled', async () => {
      hapticService.setTimeBasedEnabled(true);
      
      await hapticService.timeMilestone(5);
      
      expect(mockImpactAsync).toHaveBeenCalledTimes(1);
      expect(mockImpactAsync).toHaveBeenCalledWith('medium');
    });
  });

  describe('additional feedback methods', () => {
    it('should provide button press feedback', async () => {
      await hapticService.buttonPress();
      
      expect(mockImpactAsync).toHaveBeenCalledWith('light');
    });

    it('should provide error feedback', async () => {
      await hapticService.errorFeedback();
      
      expect(mockNotificationAsync).toHaveBeenCalledWith('error');
    });

    it('should provide success feedback', async () => {
      await hapticService.successFeedback();
      
      expect(mockNotificationAsync).toHaveBeenCalledWith('success');
    });

    it('should provide warning feedback', async () => {
      await hapticService.warningFeedback();
      
      expect(mockNotificationAsync).toHaveBeenCalledWith('warning');
    });
  });

  describe('enable/disable functionality', () => {
    it('should be enabled by default', () => {
      expect(hapticService.getEnabled()).toBe(true);
    });

    it('should allow disabling haptic feedback', async () => {
      hapticService.setEnabled(false);
      
      await hapticService.vibrate(VibrationPattern.KILOMETER);
      
      expect(mockImpactAsync).not.toHaveBeenCalled();
    });

    it('should not provide feedback when disabled', async () => {
      hapticService.setEnabled(false);
      
      await hapticService.buttonPress();
      await hapticService.errorFeedback();
      await hapticService.kilometerMilestone();
      
      expect(mockImpactAsync).not.toHaveBeenCalled();
      expect(mockNotificationAsync).not.toHaveBeenCalled();
    });

    it('should resume feedback when re-enabled', async () => {
      hapticService.setEnabled(false);
      hapticService.setEnabled(true);
      
      await hapticService.buttonPress();
      
      expect(mockImpactAsync).toHaveBeenCalledWith('light');
    });
  });

  describe('distance-based haptic settings', () => {
    it('should have distance-based haptics enabled by default', () => {
      expect(hapticService.getDistanceBasedEnabled()).toBe(true);
    });

    it('should allow disabling distance-based haptics', () => {
      hapticService.setDistanceBasedEnabled(false);
      expect(hapticService.getDistanceBasedEnabled()).toBe(false);
    });

    it('should not provide distance-based feedback when disabled', async () => {
      hapticService.setDistanceBasedEnabled(false);
      
      await hapticService.vibrate(VibrationPattern.KILOMETER);
      await hapticService.vibrate(VibrationPattern.HALF_KILOMETER);
      
      expect(mockImpactAsync).not.toHaveBeenCalled();
    });

    it('should still provide non-distance feedback when distance-based is disabled', async () => {
      hapticService.setDistanceBasedEnabled(false);
      
      await hapticService.vibrate(VibrationPattern.START_CONFIRMATION);
      
      expect(mockImpactAsync).toHaveBeenCalledWith('heavy');
    });

    it('should resume distance-based feedback when re-enabled', async () => {
      hapticService.setDistanceBasedEnabled(false);
      hapticService.setDistanceBasedEnabled(true);
      
      await hapticService.vibrate(VibrationPattern.KILOMETER);
      
      expect(mockImpactAsync).toHaveBeenCalledTimes(3);
    });
  });

  describe('time-based haptic settings', () => {
    it('should have time-based haptics disabled by default', () => {
      expect(hapticService.getTimeBasedEnabled()).toBe(false);
    });

    it('should allow enabling time-based haptics', () => {
      hapticService.setTimeBasedEnabled(true);
      expect(hapticService.getTimeBasedEnabled()).toBe(true);
    });

    it('should allow disabling time-based haptics', () => {
      hapticService.setTimeBasedEnabled(true);
      hapticService.setTimeBasedEnabled(false);
      expect(hapticService.getTimeBasedEnabled()).toBe(false);
    });

    it('should not provide time-based feedback when disabled', async () => {
      hapticService.setTimeBasedEnabled(false);
      
      await hapticService.vibrate(VibrationPattern.TIME_MILESTONE);
      
      expect(mockImpactAsync).not.toHaveBeenCalled();
    });

    it('should provide time-based feedback when enabled', async () => {
      hapticService.setTimeBasedEnabled(true);
      
      await hapticService.vibrate(VibrationPattern.TIME_MILESTONE);
      
      expect(mockImpactAsync).toHaveBeenCalledWith('medium');
    });
  });

  describe('error handling', () => {
    it('should handle haptic errors gracefully', async () => {
      mockImpactAsync.mockRejectedValueOnce(new Error('Haptic error'));
      
      // Should not throw
      await expect(hapticService.buttonPress()).resolves.toBeUndefined();
    });

    it('should handle notification errors gracefully', async () => {
      mockNotificationAsync.mockRejectedValueOnce(new Error('Notification error'));
      
      // Should not throw
      await expect(hapticService.successFeedback()).resolves.toBeUndefined();
    });

    it('should continue with pattern even if one vibration fails', async () => {
      mockImpactAsync
        .mockRejectedValueOnce(new Error('First vibration failed'))
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined);
      
      // Should not throw - the error is caught and logged
      await expect(hapticService.kilometerMilestone()).resolves.toBeUndefined();
      
      // All 3 vibration calls should be attempted despite the first one failing
      expect(mockImpactAsync).toHaveBeenCalledTimes(3);
    });
  });

  describe('haptic availability', () => {
    it('should report haptic as available when test succeeds', () => {
      expect(hapticService.isHapticAvailable()).toBe(true);
    });

    it('should handle haptic unavailability gracefully', async () => {
      mockImpactAsync.mockRejectedValueOnce(new Error('Haptic not available'));
      
      const newService = new HapticServiceImpl();
      
      // Should not throw during initialization
      expect(newService).toBeDefined();
    });

    it('should allow rechecking haptic availability', async () => {
      mockImpactAsync.mockClear();
      
      const isAvailable = await hapticService.recheckHapticAvailability();
      
      expect(mockImpactAsync).toHaveBeenCalledWith('light');
      expect(isAvailable).toBe(true);
    });

    it('should disable haptic when availability check fails', async () => {
      mockImpactAsync.mockRejectedValueOnce(new Error('Haptic not available'));
      
      await hapticService.recheckHapticAvailability();
      
      expect(hapticService.isHapticAvailable()).toBe(false);
    });
  });

  describe('pattern timing', () => {
    it('should execute kilometer pattern with multiple vibrations', async () => {
      await hapticService.vibrate(VibrationPattern.KILOMETER);
      
      // Should have 3 heavy impacts for kilometer milestone
      expect(mockImpactAsync).toHaveBeenCalledTimes(3);
      expect(mockImpactAsync).toHaveBeenCalledWith('heavy');
    });

    it('should execute half kilometer pattern with multiple vibrations', async () => {
      await hapticService.vibrate(VibrationPattern.HALF_KILOMETER);
      
      // Should have 2 medium impacts for half kilometer milestone
      expect(mockImpactAsync).toHaveBeenCalledTimes(2);
      expect(mockImpactAsync).toHaveBeenCalledWith('medium');
    });

    it('should execute stop confirmation pattern with multiple vibrations', async () => {
      await hapticService.vibrate(VibrationPattern.STOP_CONFIRMATION);
      
      // Should have 1 heavy + 2 light impacts for stop confirmation
      expect(mockImpactAsync).toHaveBeenCalledTimes(3);
      expect(mockImpactAsync).toHaveBeenNthCalledWith(1, 'heavy');
      expect(mockImpactAsync).toHaveBeenNthCalledWith(2, 'light');
      expect(mockImpactAsync).toHaveBeenNthCalledWith(3, 'light');
    });

    it('should execute pause confirmation pattern with multiple vibrations', async () => {
      await hapticService.vibrate(VibrationPattern.PAUSE_CONFIRMATION);
      
      // Should have 2 medium impacts for pause confirmation
      expect(mockImpactAsync).toHaveBeenCalledTimes(2);
      expect(mockImpactAsync).toHaveBeenCalledWith('medium');
    });

    it('should handle timing delays in patterns gracefully', async () => {
      // Test that patterns complete even with delays
      const startTime = Date.now();
      await hapticService.vibrate(VibrationPattern.KILOMETER);
      const endTime = Date.now();
      
      // Should complete in reasonable time (less than 1 second for test)
      expect(endTime - startTime).toBeLessThan(1000);
      expect(mockImpactAsync).toHaveBeenCalledTimes(3);
    });
  });

  describe('default pattern handling', () => {
    it('should use medium impact for unknown patterns', async () => {
      await hapticService.vibrate('unknown_pattern' as VibrationPattern);
      
      expect(mockImpactAsync).toHaveBeenCalledWith('medium');
    });
  });
});