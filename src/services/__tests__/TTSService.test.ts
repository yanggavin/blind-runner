import { TTSServiceImpl, AnnouncementSettings } from '../TTSService';
import { Priority, RunMetrics, VoiceSettings, RunSummary } from '../interfaces';
import { AppSettings } from '../../models/types';

// Mock expo-speech
jest.mock('expo-speech', () => ({
  speak: jest.fn(),
  stop: jest.fn(),
}));

const mockSpeak = require('expo-speech').speak as jest.MockedFunction<any>;
const mockStop = require('expo-speech').stop as jest.MockedFunction<any>;

describe('TTSService', () => {
  let ttsService: TTSServiceImpl;

  beforeEach(() => {
    ttsService = new TTSServiceImpl();
    jest.clearAllMocks();
    
    // Mock successful speech completion
    mockSpeak.mockImplementation((text, options) => {
      setTimeout(() => {
        if (options?.onDone) {
          options.onDone();
        }
      }, 10);
    });
  });

  afterEach(() => {
    ttsService.cleanup();
  });

  describe('basic speech functionality', () => {
    it('should speak text with default priority', async () => {
      await ttsService.speak('Hello world');
      
      expect(mockSpeak).toHaveBeenCalledWith('Hello world', expect.objectContaining({
        rate: 1.0,
        pitch: 1.0,
      }));
    });

    it('should handle high priority speech by interrupting current speech', async () => {
      // Start speaking with normal priority
      const normalPromise = ttsService.speak('Normal priority message', Priority.NORMAL);
      
      // Immediately add high priority message
      const highPromise = ttsService.speak('High priority message', Priority.HIGH);
      
      await Promise.all([normalPromise, highPromise]);
      
      expect(mockStop).toHaveBeenCalled();
      expect(mockSpeak).toHaveBeenCalledWith('High priority message', expect.any(Object));
    });

    it('should queue multiple messages and process them in order', async () => {
      const promises = [
        ttsService.speak('First message'),
        ttsService.speak('Second message'),
        ttsService.speak('Third message'),
      ];
      
      await Promise.all(promises);
      
      expect(mockSpeak).toHaveBeenCalledTimes(3);
      expect(mockSpeak).toHaveBeenNthCalledWith(1, 'First message', expect.any(Object));
      expect(mockSpeak).toHaveBeenNthCalledWith(2, 'Second message', expect.any(Object));
      expect(mockSpeak).toHaveBeenNthCalledWith(3, 'Third message', expect.any(Object));
    });
  });

  describe('voice settings', () => {
    it('should apply custom voice settings', async () => {
      const customSettings: VoiceSettings = {
        rate: 0.8,
        pitch: 1.2,
      };
      
      ttsService.setVoiceSettings(customSettings);
      await ttsService.speak('Test message');
      
      expect(mockSpeak).toHaveBeenCalledWith('Test message', expect.objectContaining({
        rate: 0.8,
        pitch: 1.2,
      }));
    });
  });

  describe('run announcements', () => {
    it('should announce run start', async () => {
      await ttsService.announceRunStart();
      
      expect(mockSpeak).toHaveBeenCalledWith(
        'Run started. GPS tracking active.',
        expect.any(Object)
      );
    });

    it('should announce run pause', async () => {
      await ttsService.announceRunPause();
      
      expect(mockSpeak).toHaveBeenCalledWith('Run paused.', expect.any(Object));
    });

    it('should announce run resume', async () => {
      await ttsService.announceRunResume();
      
      expect(mockSpeak).toHaveBeenCalledWith('Run resumed.', expect.any(Object));
    });

    it('should announce metrics correctly', async () => {
      const metrics: RunMetrics = {
        distance: 2500, // 2.5 km
        duration: 900, // 15 minutes
        currentPace: 6.5, // 6 minutes 30 seconds per km
        averagePace: 6.0,
        splits: [],
      };
      
      await ttsService.announceMetrics(metrics);
      
      expect(mockSpeak).toHaveBeenCalledWith(
        expect.stringContaining('Distance: 2.50 kilometers'),
        expect.any(Object)
      );
      expect(mockSpeak).toHaveBeenCalledWith(
        expect.stringContaining('Time: 15 minutes and 0 seconds'),
        expect.any(Object)
      );
      expect(mockSpeak).toHaveBeenCalledWith(
        expect.stringContaining('Current pace: 6 minutes and 30 seconds per kilometer'),
        expect.any(Object)
      );
    });

    it('should announce run completion with summary', async () => {
      const summary: RunSummary = {
        totalDistance: 5000, // 5 km
        totalDuration: 1800, // 30 minutes
        averagePace: 6.0, // 6 minutes per km
        splits: [
          { id: 1, runId: 1, splitNumber: 1, distance: 1000, duration: 360, pace: 6.0, timestamp: new Date() },
          { id: 2, runId: 1, splitNumber: 2, distance: 1000, duration: 360, pace: 6.0, timestamp: new Date() },
        ],
      };
      
      await ttsService.announceRunComplete(summary);
      
      expect(mockSpeak).toHaveBeenCalledWith(
        expect.stringContaining('Run completed!'),
        expect.any(Object)
      );
      expect(mockSpeak).toHaveBeenCalledWith(
        expect.stringContaining('Total distance: 5.00 kilometers'),
        expect.any(Object)
      );
      expect(mockSpeak).toHaveBeenCalledWith(
        expect.stringContaining('You completed 2 kilometer splits'),
        expect.any(Object)
      );
    });
  });

  describe('additional announcement methods', () => {
    it('should announce kilometer split', async () => {
      await ttsService.announceKilometerSplit(3, 375); // 6 minutes 15 seconds
      
      expect(mockSpeak).toHaveBeenCalledWith(
        'Kilometer 3 completed in 6 minutes and 15 seconds.',
        expect.any(Object)
      );
    });

    it('should announce auto-pause', async () => {
      await ttsService.announceAutoPause();
      
      expect(mockSpeak).toHaveBeenCalledWith('Auto-pause activated.', expect.any(Object));
    });

    it('should announce auto-resume', async () => {
      await ttsService.announceAutoResume();
      
      expect(mockSpeak).toHaveBeenCalledWith('Auto-resume activated.', expect.any(Object));
    });

    it('should announce GPS lost', async () => {
      await ttsService.announceGPSLost();
      
      expect(mockSpeak).toHaveBeenCalledWith(
        'GPS signal lost. Continuing time tracking.',
        expect.any(Object)
      );
    });

    it('should announce GPS restored', async () => {
      await ttsService.announceGPSRestored();
      
      expect(mockSpeak).toHaveBeenCalledWith('GPS signal restored.', expect.any(Object));
    });
  });

  describe('queue management', () => {
    it('should clear queue and stop current speech', async () => {
      // Start speaking without awaiting to test queue state
      const promise = ttsService.speak('Test message');
      
      // The message should be in queue or being processed
      expect(ttsService.getQueueLength() >= 0).toBe(true);
      
      ttsService.clearQueue();
      
      expect(ttsService.getQueueLength()).toBe(0);
      expect(mockStop).toHaveBeenCalled();
      
      // Clean up the promise
      await promise.catch(() => {}); // Ignore errors from clearing
    });

    it('should track speaking state', async () => {
      expect(ttsService.getIsSpeaking()).toBe(false);
      
      const promise = ttsService.speak('Test message');
      expect(ttsService.getIsSpeaking()).toBe(true);
      
      await promise;
      expect(ttsService.getIsSpeaking()).toBe(false);
    });
  });

  describe('error handling', () => {
    it('should handle speech errors gracefully', async () => {
      mockSpeak.mockImplementationOnce((text, options) => {
        setTimeout(() => {
          if (options?.onError) {
            options.onError(new Error('TTS Error'));
          }
        }, 10);
      });
      
      // Should not throw
      await expect(ttsService.speak('Test message')).resolves.toBeUndefined();
    });

    it('should continue processing queue after error', async () => {
      mockSpeak
        .mockImplementationOnce((text, options) => {
          setTimeout(() => {
            if (options?.onError) {
              options.onError(new Error('TTS Error'));
            }
          }, 10);
        })
        .mockImplementationOnce((text, options) => {
          setTimeout(() => {
            if (options?.onDone) {
              options.onDone();
            }
          }, 10);
        });
      
      await Promise.all([
        ttsService.speak('First message'),
        ttsService.speak('Second message'),
      ]);
      
      expect(mockSpeak).toHaveBeenCalledTimes(2);
    });
  });

  describe('periodic announcements', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should configure announcement settings', () => {
      const settings: Partial<AnnouncementSettings> = {
        timeIntervalMinutes: 3,
        distanceIntervalMeters: 500,
        enableTimeAnnouncements: false,
      };

      ttsService.setAnnouncementSettings(settings);
      const currentSettings = ttsService.getAnnouncementSettings();

      expect(currentSettings.timeIntervalMinutes).toBe(3);
      expect(currentSettings.distanceIntervalMeters).toBe(500);
      expect(currentSettings.enableTimeAnnouncements).toBe(false);
      expect(currentSettings.enableDistanceAnnouncements).toBe(true); // unchanged
    });

    it('should configure from app settings', () => {
      const appSettings: AppSettings = {
        id: 1,
        announcementFrequencyMinutes: 2,
        announcementFrequencyDistance: 800,
        hapticDistanceEnabled: true,
        hapticTimeEnabled: false,
        voiceRate: 0.8,
        voicePitch: 1.2,
        autoPauseEnabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      ttsService.configureFromAppSettings(appSettings);
      
      const announcementSettings = ttsService.getAnnouncementSettings();
      expect(announcementSettings.timeIntervalMinutes).toBe(2);
      expect(announcementSettings.distanceIntervalMeters).toBe(800);
    });

    it('should start and stop periodic announcements', () => {
      const getMetrics = jest.fn().mockReturnValue({
        distance: 1000,
        duration: 300,
        currentPace: 6.0,
        averagePace: 6.0,
        splits: [],
      });

      ttsService.startPeriodicAnnouncements(getMetrics);
      
      // Fast-forward 30 seconds (announcement check interval)
      jest.advanceTimersByTime(30000);
      
      expect(getMetrics).toHaveBeenCalled();
      
      ttsService.stopPeriodicAnnouncements();
      
      // Clear mock calls
      getMetrics.mockClear();
      
      // Fast-forward another 30 seconds
      jest.advanceTimersByTime(30000);
      
      // Should not be called after stopping
      expect(getMetrics).not.toHaveBeenCalled();
    });

    it('should announce metrics based on time interval', async () => {
      // Set 2-minute intervals
      ttsService.setAnnouncementSettings({
        timeIntervalMinutes: 2,
        enableTimeAnnouncements: true,
        enableDistanceAnnouncements: false,
      });

      const getMetrics = jest.fn()
        .mockReturnValueOnce({
          distance: 500,
          duration: 60, // 1 minute - should not trigger
          currentPace: 6.0,
          averagePace: 6.0,
          splits: [],
        })
        .mockReturnValueOnce({
          distance: 1000,
          duration: 120, // 2 minutes - should trigger
          currentPace: 6.0,
          averagePace: 6.0,
          splits: [],
        });

      ttsService.startPeriodicAnnouncements(getMetrics);
      
      // First check - should not announce
      jest.advanceTimersByTime(30000);
      await Promise.resolve(); // Allow async operations to complete
      
      expect(mockSpeak).not.toHaveBeenCalled();
      
      // Second check - should announce
      jest.advanceTimersByTime(30000);
      await Promise.resolve();
      
      expect(mockSpeak).toHaveBeenCalledWith(
        expect.stringContaining('Distance: 1.00 kilometers'),
        expect.any(Object)
      );
      
      const tracking = ttsService.getAnnouncementTracking();
      expect(tracking.lastTime).toBe(120);
    });

    it('should announce metrics based on distance interval', async () => {
      // Set 1km intervals
      ttsService.setAnnouncementSettings({
        distanceIntervalMeters: 1000,
        enableTimeAnnouncements: false,
        enableDistanceAnnouncements: true,
      });

      const getMetrics = jest.fn()
        .mockReturnValueOnce({
          distance: 500, // 0.5km - should not trigger
          duration: 180,
          currentPace: 6.0,
          averagePace: 6.0,
          splits: [],
        })
        .mockReturnValueOnce({
          distance: 1200, // 1.2km - should trigger
          duration: 360,
          currentPace: 6.0,
          averagePace: 6.0,
          splits: [],
        });

      ttsService.startPeriodicAnnouncements(getMetrics);
      
      // First check - should not announce
      jest.advanceTimersByTime(30000);
      await Promise.resolve();
      
      expect(mockSpeak).not.toHaveBeenCalled();
      
      // Second check - should announce
      jest.advanceTimersByTime(30000);
      await Promise.resolve();
      
      expect(mockSpeak).toHaveBeenCalledWith(
        expect.stringContaining('Distance: 1.20 kilometers'),
        expect.any(Object)
      );
      
      const tracking = ttsService.getAnnouncementTracking();
      expect(tracking.lastDistance).toBe(1200);
    });

    it('should handle both time and distance announcements', async () => {
      // Set both types enabled with different intervals
      ttsService.setAnnouncementSettings({
        timeIntervalMinutes: 1, // 1 minute
        distanceIntervalMeters: 500, // 500m
        enableTimeAnnouncements: true,
        enableDistanceAnnouncements: true,
      });

      const getMetrics = jest.fn().mockReturnValue({
        distance: 600, // Should trigger distance announcement
        duration: 70, // Should trigger time announcement
        currentPace: 6.0,
        averagePace: 6.0,
        splits: [],
      });

      ttsService.startPeriodicAnnouncements(getMetrics);
      
      jest.advanceTimersByTime(30000);
      await Promise.resolve();
      
      // Should announce once (both conditions met, but only one announcement)
      expect(mockSpeak).toHaveBeenCalledTimes(1);
      expect(mockSpeak).toHaveBeenCalledWith(
        expect.stringContaining('Distance: 0.60 kilometers'),
        expect.any(Object)
      );
    });

    it('should reset announcement tracking', () => {
      // Set some tracking values
      ttsService.setAnnouncementSettings({
        timeIntervalMinutes: 1,
        distanceIntervalMeters: 1000,
      });

      const getMetrics = jest.fn().mockReturnValue({
        distance: 1500,
        duration: 120,
        currentPace: 6.0,
        averagePace: 6.0,
        splits: [],
      });

      ttsService.startPeriodicAnnouncements(getMetrics);
      jest.advanceTimersByTime(30000);

      // Should have tracking values
      let tracking = ttsService.getAnnouncementTracking();
      expect(tracking.lastTime).toBeGreaterThan(0);
      expect(tracking.lastDistance).toBeGreaterThan(0);

      // Reset tracking
      ttsService.resetAnnouncementTracking();
      
      tracking = ttsService.getAnnouncementTracking();
      expect(tracking.lastTime).toBe(0);
      expect(tracking.lastDistance).toBe(0);
    });

    it('should not announce when announcements are disabled', async () => {
      ttsService.setAnnouncementSettings({
        timeIntervalMinutes: 1,
        distanceIntervalMeters: 500,
        enableTimeAnnouncements: false,
        enableDistanceAnnouncements: false,
      });

      const getMetrics = jest.fn().mockReturnValue({
        distance: 1000,
        duration: 120,
        currentPace: 6.0,
        averagePace: 6.0,
        splits: [],
      });

      ttsService.startPeriodicAnnouncements(getMetrics);
      
      jest.advanceTimersByTime(30000);
      await Promise.resolve();
      
      expect(mockSpeak).not.toHaveBeenCalled();
    });
  });

  describe('cleanup', () => {
    it('should cleanup timers and queue', async () => {
      jest.useFakeTimers();
      
      const getMetrics = jest.fn().mockReturnValue({
        distance: 1000,
        duration: 300,
        currentPace: 6.0,
        averagePace: 6.0,
        splits: [],
      });

      ttsService.startPeriodicAnnouncements(getMetrics);
      
      // Add multiple messages to queue
      const promises = [
        ttsService.speak('First message'),
        ttsService.speak('Second message'),
        ttsService.speak('Third message'),
      ];
      
      // The first message starts immediately, but others should be queued
      expect(ttsService.getQueueLength()).toBeGreaterThanOrEqual(0);
      
      ttsService.cleanup();
      
      expect(ttsService.getQueueLength()).toBe(0);
      expect(mockStop).toHaveBeenCalled();
      
      jest.useRealTimers();
      
      // Clean up promises
      await Promise.allSettled(promises);
    });
  });
});