import { ServiceIntegrationManager } from '../../services/ServiceIntegrationManager';
import { AccessibilityInfo } from 'react-native';

// Mock React Native modules
jest.mock('react-native', () => ({
  AccessibilityInfo: {
    isScreenReaderEnabled: jest.fn(),
    addEventListener: jest.fn(),
    announceForAccessibility: jest.fn(),
  },
  Platform: {
    OS: 'ios',
  },
}));

jest.mock('expo-location');
jest.mock('expo-speech');
jest.mock('expo-haptics');

describe('Accessibility Integration E2E Tests', () => {
  let serviceManager: ServiceIntegrationManager;
  const mockAccessibilityInfo = AccessibilityInfo as jest.Mocked<typeof AccessibilityInfo>;

  beforeEach(async () => {
    jest.clearAllMocks();
    
    // Mock screen reader as enabled
    mockAccessibilityInfo.isScreenReaderEnabled.mockResolvedValue(true);
    
    serviceManager = ServiceIntegrationManager.getInstance();
    await serviceManager.initialize();
  });

  afterEach(async () => {
    await serviceManager.cleanup();
  });

  describe('Voice-Only Operation Workflow', () => {
    it('should complete full run workflow using only voice feedback', async () => {
      const ttsService = serviceManager.services.tts;
      
      // Start run with voice confirmation
      const runData = await serviceManager.startRun();
      
      expect(ttsService.speak).toHaveBeenCalledWith(expect.stringContaining('Run started'));
      
      // Simulate periodic announcements during run
      const metrics = {
        distance: 1.5,
        duration: 450, // 7.5 minutes
        currentPace: 5.0,
        averagePace: 5.0,
        splits: []
      };
      
      await ttsService.announceMetrics(metrics);
      
      expect(ttsService.speak).toHaveBeenCalledWith(
        expect.stringContaining('1.5 kilometers')
      );
      expect(ttsService.speak).toHaveBeenCalledWith(
        expect.stringContaining('7 minutes 30 seconds')
      );
      expect(ttsService.speak).toHaveBeenCalledWith(
        expect.stringContaining('5 minutes per kilometer')
      );
      
      // Pause with voice confirmation
      await serviceManager.pauseRun();
      expect(ttsService.speak).toHaveBeenCalledWith(expect.stringContaining('Run paused'));
      
      // Resume with voice confirmation
      await serviceManager.resumeRun();
      expect(ttsService.speak).toHaveBeenCalledWith(expect.stringContaining('Run resumed'));
      
      // Complete run with summary
      const completedRun = await serviceManager.stopRun();
      expect(ttsService.announceRunComplete).toHaveBeenCalledWith(completedRun);
    });

    it('should provide detailed voice navigation for run history', async () => {
      const ttsService = serviceManager.services.tts;
      
      // Create mock run history
      const mockRuns = [
        {
          id: 1,
          startTime: new Date('2023-01-01T10:00:00Z'),
          totalDistance: 5.2,
          totalDuration: 1800, // 30 minutes
          averagePace: 5.77,
          status: 'completed' as const
        },
        {
          id: 2,
          startTime: new Date('2023-01-02T10:00:00Z'),
          totalDistance: 3.1,
          totalDuration: 1200, // 20 minutes
          averagePace: 6.45,
          status: 'completed' as const
        }
      ];
      
      // Mock database service
      serviceManager.services.database.getAllRuns = jest.fn().mockResolvedValue(mockRuns);
      
      const runHistory = await serviceManager.getRunHistory();
      
      // Verify runs are accessible
      expect(runHistory).toHaveLength(2);
      
      // Test voice announcement of run details
      const runDetails = await serviceManager.getRunDetails(1);
      
      if (runDetails) {
        await ttsService.announceRunSummary(runDetails);
        
        expect(ttsService.speak).toHaveBeenCalledWith(
          expect.stringContaining('5.2 kilometers')
        );
        expect(ttsService.speak).toHaveBeenCalledWith(
          expect.stringContaining('30 minutes')
        );
      }
    });

    it('should handle voice-guided settings configuration', async () => {
      const ttsService = serviceManager.services.tts;
      
      // Test announcement frequency setting
      await serviceManager.updateSettings({
        announcementFrequencyMinutes: 3
      });
      
      expect(ttsService.speak).toHaveBeenCalledWith('Settings updated successfully');
      
      // Test voice rate setting
      await serviceManager.updateSettings({
        voiceRate: 1.5
      });
      
      // Verify TTS service received the new settings
      expect(ttsService.updateSettings).toHaveBeenCalledWith(
        expect.objectContaining({ voiceRate: 1.5 })
      );
    });
  });

  describe('Screen Reader Integration', () => {
    it('should work seamlessly with VoiceOver/TalkBack during run', async () => {
      // Simulate screen reader enabled
      mockAccessibilityInfo.isScreenReaderEnabled.mockResolvedValue(true);
      
      const ttsService = serviceManager.services.tts;
      
      // Start run
      await serviceManager.startRun();
      
      // Verify accessibility announcements don't conflict with TTS
      expect(ttsService.speak).toHaveBeenCalledWith(expect.stringContaining('Run started'));
      
      // Test that metrics are announced in screen reader friendly format
      const metrics = serviceManager.getCurrentRunMetrics();
      await ttsService.announceMetrics(metrics);
      
      // Verify structured announcement format
      expect(ttsService.speak).toHaveBeenCalledWith(
        expect.stringMatching(/Distance.*Time.*Pace/)
      );
    });

    it('should handle screen reader state changes during run', async () => {
      let screenReaderCallback: ((enabled: boolean) => void) | undefined;
      
      // Mock addEventListener to capture callback
      mockAccessibilityInfo.addEventListener.mockImplementation((event, callback) => {
        if (event === 'screenReaderChanged') {
          screenReaderCallback = callback;
        }
        return { remove: jest.fn() };
      });
      
      // Start run
      await serviceManager.startRun();
      
      // Simulate screen reader being disabled during run
      if (screenReaderCallback) {
        screenReaderCallback(false);
      }
      
      // Verify app continues to function
      expect(serviceManager.isRunActive()).toBe(true);
      
      // Simulate screen reader being re-enabled
      if (screenReaderCallback) {
        screenReaderCallback(true);
      }
      
      // Verify accessibility features are restored
      const ttsService = serviceManager.services.tts;
      expect(ttsService.speak).toHaveBeenCalled();
    });
  });

  describe('Haptic-Only Operation', () => {
    it('should provide complete feedback through haptics when TTS fails', async () => {
      const ttsService = serviceManager.services.tts;
      const hapticService = serviceManager.services.haptic;
      
      // Mock TTS failure
      ttsService.speak.mockRejectedValue(new Error('TTS unavailable'));
      
      // Start run - should still work with haptic feedback
      await serviceManager.startRun();
      
      expect(hapticService.playRunStartPattern).toHaveBeenCalled();
      
      // Simulate kilometer milestone
      await serviceManager.services.runTracking.onSplitComplete!({
        splitNumber: 1,
        distance: 1000,
        duration: 300,
        pace: 5.0
      });
      
      expect(hapticService.playKilometerPattern).toHaveBeenCalled();
      
      // Simulate half-kilometer
      await serviceManager.services.runTracking.onHalfKilometer!();
      
      expect(hapticService.playHalfKilometerPattern).toHaveBeenCalled();
    });

    it('should provide distinct haptic patterns for different events', async () => {
      const hapticService = serviceManager.services.haptic;
      
      // Test all haptic patterns
      await serviceManager.startRun();
      expect(hapticService.playRunStartPattern).toHaveBeenCalled();
      
      await serviceManager.pauseRun();
      expect(hapticService.playRunPausePattern).toHaveBeenCalled();
      
      await serviceManager.resumeRun();
      expect(hapticService.playRunResumePattern).toHaveBeenCalled();
      
      await serviceManager.stopRun();
      expect(hapticService.playRunCompletePattern).toHaveBeenCalled();
      
      // Verify each pattern is distinct
      expect(hapticService.playRunStartPattern).toHaveBeenCalledTimes(1);
      expect(hapticService.playRunPausePattern).toHaveBeenCalledTimes(1);
      expect(hapticService.playRunResumePattern).toHaveBeenCalledTimes(1);
      expect(hapticService.playRunCompletePattern).toHaveBeenCalledTimes(1);
    });
  });

  describe('High Contrast and Visual Accessibility', () => {
    it('should maintain accessibility when visual elements are used', async () => {
      // This test would verify that visual components maintain
      // proper contrast ratios and accessibility labels
      
      const metrics = serviceManager.getCurrentRunMetrics();
      
      // Verify metrics are available for screen readers
      expect(metrics).toHaveProperty('distance');
      expect(metrics).toHaveProperty('duration');
      expect(metrics).toHaveProperty('currentPace');
      expect(metrics).toHaveProperty('averagePace');
      
      // In a real implementation, this would test that UI components
      // have proper accessibility labels and contrast ratios
    });
  });

  describe('Emergency Accessibility Features', () => {
    it('should provide accessible SOS functionality', async () => {
      const ttsService = serviceManager.services.tts;
      const hapticService = serviceManager.services.haptic;
      
      // Set up emergency contact
      await serviceManager.services.database.addEmergencyContact({
        id: 1,
        name: 'Emergency Contact',
        phoneNumber: '+1234567890',
        isPrimary: true
      });
      
      // Trigger SOS
      await serviceManager.triggerSOS();
      
      // Verify accessible confirmations
      expect(ttsService.speak).toHaveBeenCalledWith('SOS message sent to emergency contacts');
      expect(hapticService.playSOSConfirmationPattern).toHaveBeenCalled();
    });

    it('should handle SOS with clear voice guidance when no contacts exist', async () => {
      const ttsService = serviceManager.services.tts;
      
      // Trigger SOS without emergency contacts
      await serviceManager.triggerSOS();
      
      // Verify clear guidance message
      expect(ttsService.speak).toHaveBeenCalledWith(
        'No emergency contacts configured. Please set up emergency contacts in settings.'
      );
    });
  });

  describe('Screen-Off Operation', () => {
    it('should maintain full functionality with screen off', async () => {
      const ttsService = serviceManager.services.tts;
      const hapticService = serviceManager.services.haptic;
      
      // Start run (screen can be off)
      await serviceManager.startRun();
      
      expect(ttsService.speak).toHaveBeenCalledWith(expect.stringContaining('Run started'));
      expect(hapticService.playRunStartPattern).toHaveBeenCalled();
      
      // Verify all critical functions work without visual interface
      expect(serviceManager.isRunActive()).toBe(true);
      
      const metrics = serviceManager.getCurrentRunMetrics();
      expect(metrics).toBeDefined();
      
      // Pause and resume should work
      await serviceManager.pauseRun();
      expect(serviceManager.isRunPaused()).toBe(true);
      
      await serviceManager.resumeRun();
      expect(serviceManager.isRunActive()).toBe(true);
      
      // Stop run
      await serviceManager.stopRun();
      expect(serviceManager.isRunActive()).toBe(false);
    });
  });

  describe('Accessibility Error Handling', () => {
    it('should provide accessible error messages and recovery options', async () => {
      const ttsService = serviceManager.services.tts;
      const errorHandlingService = serviceManager.services.errorHandling;
      
      // Mock location permission error
      const locationService = serviceManager.services.location;
      locationService.hasPermission.mockResolvedValue(false);
      
      // Attempt to start run
      try {
        await serviceManager.startRun();
      } catch (error) {
        // Verify error is handled accessibly
        expect(errorHandlingService.handleError).toHaveBeenCalled();
      }
      
      // Mock GPS error during run
      const gpsError = new Error('GPS signal lost');
      await errorHandlingService.handleError(gpsError, 'GPS tracking');
      
      // Verify accessible error announcement
      expect(ttsService.speak).toHaveBeenCalledWith(
        expect.stringContaining('GPS')
      );
    });
  });
});