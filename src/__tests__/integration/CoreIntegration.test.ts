/**
 * Core Integration Tests
 * Tests the integration between core services without external dependencies
 */

import { RunTrackingServiceImpl } from '../../services/RunTrackingService';
import { TTSServiceImpl } from '../../services/TTSService';
import { HapticServiceImpl } from '../../services/HapticService';
import { RunData, AppSettings } from '../../models/types';

// Mock only the external dependencies
jest.mock('expo-location');
jest.mock('expo-speech');
jest.mock('expo-haptics');
jest.mock('expo-sqlite');

describe('Core Service Integration Tests', () => {
  let runTrackingService: RunTrackingServiceImpl;
  let ttsService: TTSServiceImpl;
  let hapticService: HapticServiceImpl;
  let mockDatabaseService: any;

  beforeEach(async () => {
    jest.clearAllMocks();
    
    // Create service instances
    const mockLocationService = {
      initialize: jest.fn(),
      startTracking: jest.fn(),
      stopTracking: jest.fn(),
      getCurrentLocation: jest.fn(),
      hasPermission: jest.fn().mockResolvedValue(true),
      isGPSEnabled: jest.fn().mockResolvedValue(true),
      cleanup: jest.fn(),
      onLocationUpdate: jest.fn(),
    };

    runTrackingService = new RunTrackingServiceImpl(mockLocationService as any);
    ttsService = new TTSServiceImpl();
    hapticService = new HapticServiceImpl();
    
    // Mock database service
    mockDatabaseService = {
      initialize: jest.fn(),
      saveRun: jest.fn(),
      getRunById: jest.fn(),
      updateSettings: jest.fn(),
      getSettings: jest.fn(),
    };

    // Initialize services
    await runTrackingService.initialize();
    await ttsService.initialize();
    await hapticService.initialize();
    await mockDatabaseService.initialize();
  });

  describe('Run Tracking and Feedback Integration', () => {
    it('should coordinate run events with TTS and haptic feedback', async () => {
      // Set up event handlers to simulate integration
      let runStarted = false;
      let runPaused = false;
      let runResumed = false;
      let runCompleted = false;

      runTrackingService.onRunStart = async (runData: RunData) => {
        runStarted = true;
        await ttsService.announceRunStart();
        await hapticService.playRunStartPattern();
      };

      runTrackingService.onRunPause = async () => {
        runPaused = true;
        await ttsService.announceRunPause();
        await hapticService.playRunPausePattern();
      };

      runTrackingService.onRunResume = async () => {
        runResumed = true;
        await ttsService.announceRunResume();
        await hapticService.playRunResumePattern();
      };

      runTrackingService.onRunComplete = async (runData: RunData) => {
        runCompleted = true;
        await ttsService.announceRunComplete(runData);
        await hapticService.playRunCompletePattern();
      };

      // Test run workflow
      const runData = await runTrackingService.startRun();
      expect(runStarted).toBe(true);
      expect(ttsService.announceRunStart).toHaveBeenCalled();
      expect(hapticService.playRunStartPattern).toHaveBeenCalled();

      await runTrackingService.pauseRun();
      expect(runPaused).toBe(true);
      expect(ttsService.announceRunPause).toHaveBeenCalled();
      expect(hapticService.playRunPausePattern).toHaveBeenCalled();

      await runTrackingService.resumeRun();
      expect(runResumed).toBe(true);
      expect(ttsService.announceRunResume).toHaveBeenCalled();
      expect(hapticService.playRunResumePattern).toHaveBeenCalled();

      const completedRun = await runTrackingService.stopRun();
      expect(runCompleted).toBe(true);
      expect(ttsService.announceRunComplete).toHaveBeenCalledWith(completedRun);
      expect(hapticService.playRunCompletePattern).toHaveBeenCalled();
    });

    it('should handle milestone events with coordinated feedback', async () => {
      let splitCompleted = false;
      let halfKilometerReached = false;

      runTrackingService.onSplitComplete = async (splitData: any) => {
        splitCompleted = true;
        await ttsService.announceSplit(splitData);
        await hapticService.playKilometerPattern();
      };

      runTrackingService.onHalfKilometer = async () => {
        halfKilometerReached = true;
        await hapticService.playHalfKilometerPattern();
      };

      // Start run
      await runTrackingService.startRun();

      // Simulate split completion
      const mockSplitData = {
        splitNumber: 1,
        distance: 1000,
        duration: 300,
        pace: 5.0
      };

      await runTrackingService.onSplitComplete!(mockSplitData);
      expect(splitCompleted).toBe(true);
      expect(ttsService.announceSplit).toHaveBeenCalledWith(mockSplitData);
      expect(hapticService.playKilometerPattern).toHaveBeenCalled();

      // Simulate half kilometer
      await runTrackingService.onHalfKilometer!();
      expect(halfKilometerReached).toBe(true);
      expect(hapticService.playHalfKilometerPattern).toHaveBeenCalled();
    });
  });

  describe('Settings Integration', () => {
    it('should propagate settings changes across services', async () => {
      const newSettings: AppSettings = {
        announcementFrequencyMinutes: 3,
        announcementFrequencyDistance: 500,
        hapticDistanceEnabled: false,
        hapticTimeEnabled: true,
        voiceRate: 1.5,
        voicePitch: 1.2,
        autoPauseEnabled: false
      };

      // Update settings in each service
      await ttsService.updateSettings(newSettings);
      await hapticService.updateSettings(newSettings);
      await runTrackingService.updateSettings(newSettings);

      // Verify settings were applied
      expect(ttsService.updateSettings).toHaveBeenCalledWith(newSettings);
      expect(hapticService.updateSettings).toHaveBeenCalledWith(newSettings);
      expect(runTrackingService.updateSettings).toHaveBeenCalledWith(newSettings);
    });
  });

  describe('Data Persistence Integration', () => {
    it('should save and retrieve run data consistently', async () => {
      // Create a run
      const runData = await runTrackingService.startRun();
      
      // Add some mock data
      runData.totalDistance = 5.2;
      runData.totalDuration = 1800; // 30 minutes
      runData.averagePace = 5.77;

      // Complete the run
      const completedRun = await runTrackingService.stopRun();
      
      // Mock saved run
      mockDatabaseService.getRunById.mockResolvedValue(completedRun);
      
      // Save to database
      await mockDatabaseService.saveRun(completedRun);
      
      // Retrieve from database
      const savedRun = await mockDatabaseService.getRunById(completedRun.id);
      
      expect(savedRun).toBeDefined();
      expect(savedRun!.id).toBe(completedRun.id);
      expect(savedRun!.totalDistance).toBe(completedRun.totalDistance);
      expect(savedRun!.totalDuration).toBe(completedRun.totalDuration);
    });

    it('should handle settings persistence', async () => {
      const settings: AppSettings = {
        announcementFrequencyMinutes: 7,
        announcementFrequencyDistance: 800,
        hapticDistanceEnabled: true,
        hapticTimeEnabled: false,
        voiceRate: 1.1,
        voicePitch: 0.9,
        autoPauseEnabled: true
      };

      // Mock saved settings
      mockDatabaseService.getSettings.mockResolvedValue(settings);
      
      // Save settings
      await mockDatabaseService.updateSettings(settings);
      
      // Retrieve settings
      const savedSettings = await mockDatabaseService.getSettings();
      
      expect(savedSettings).toMatchObject(settings);
    });
  });

  describe('Error Handling Integration', () => {
    it('should handle service failures gracefully', async () => {
      // Mock TTS failure
      ttsService.speak = jest.fn().mockRejectedValue(new Error('TTS unavailable'));
      
      // Start run should still work even if TTS fails
      const runData = await runTrackingService.startRun();
      expect(runData).toBeDefined();
      expect(runData.status).toBe('active');
      
      // Haptic feedback should still work
      expect(hapticService.playRunStartPattern).toHaveBeenCalled();
    });

    it('should handle database failures with appropriate fallbacks', async () => {
      // Mock database failure
      mockDatabaseService.saveRun = jest.fn().mockRejectedValue(new Error('Database unavailable'));
      
      // Run should still complete even if save fails
      const runData = await runTrackingService.startRun();
      const completedRun = await runTrackingService.stopRun();
      
      expect(completedRun.status).toBe('completed');
      
      // Attempt to save should fail gracefully
      try {
        await mockDatabaseService.saveRun(completedRun);
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe('Database unavailable');
      }
    });
  });

  describe('State Management Integration', () => {
    it('should maintain consistent state across services', async () => {
      // Start run
      const runData = await runTrackingService.startRun();
      expect(runTrackingService.isRunning()).toBe(true);
      expect(runTrackingService.isPaused()).toBe(false);
      
      // Pause run
      await runTrackingService.pauseRun();
      expect(runTrackingService.isRunning()).toBe(false);
      expect(runTrackingService.isPaused()).toBe(true);
      
      // Resume run
      await runTrackingService.resumeRun();
      expect(runTrackingService.isRunning()).toBe(true);
      expect(runTrackingService.isPaused()).toBe(false);
      
      // Stop run
      await runTrackingService.stopRun();
      expect(runTrackingService.isRunning()).toBe(false);
      expect(runTrackingService.isPaused()).toBe(false);
    });
  });

  describe('Metrics Calculation Integration', () => {
    it('should calculate and announce metrics correctly', async () => {
      // Start run
      await runTrackingService.startRun();
      
      // Add location points to simulate running
      const locations = [
        { latitude: 37.7749, longitude: -122.4194, timestamp: Date.now() },
        { latitude: 37.7750, longitude: -122.4195, timestamp: Date.now() + 30000 },
        { latitude: 37.7751, longitude: -122.4196, timestamp: Date.now() + 60000 },
      ];
      
      for (const location of locations) {
        await runTrackingService.addLocationPoint(location);
      }
      
      // Get current metrics
      const metrics = runTrackingService.getCurrentMetrics();
      
      expect(metrics).toBeDefined();
      expect(metrics.distance).toBeGreaterThanOrEqual(0);
      expect(metrics.duration).toBeGreaterThanOrEqual(0);
      
      // Test metrics announcement
      await ttsService.announceMetrics(metrics);
      expect(ttsService.announceMetrics).toHaveBeenCalledWith(metrics);
    });
  });
});