import { ServiceIntegrationManager } from '../../services/ServiceIntegrationManager';
import { DatabaseService } from '../../database/DatabaseService';
import { RunData, AppSettings } from '../../models/types';

// Mock external dependencies
jest.mock('expo-location');
jest.mock('expo-speech');
jest.mock('expo-haptics');
jest.mock('expo-sensors');
jest.mock('expo-sms');

describe('Complete Run Workflow E2E Tests', () => {
  let serviceManager: ServiceIntegrationManager;
  let databaseService: DatabaseService;

  beforeEach(async () => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Initialize fresh service manager
    serviceManager = ServiceIntegrationManager.getInstance();
    databaseService = new DatabaseService();
    
    // Initialize services
    await serviceManager.initialize();
  });

  afterEach(async () => {
    await serviceManager.cleanup();
  });

  describe('Complete Run Journey', () => {
    it('should complete a full run from start to finish with all integrations', async () => {
      // Step 1: Start a new run
      const startedRun = await serviceManager.startRun();
      
      expect(startedRun).toBeDefined();
      expect(startedRun.status).toBe('active');
      expect(serviceManager.isRunActive()).toBe(true);
      
      // Verify TTS announcement was made
      const ttsService = serviceManager.services.tts;
      expect(ttsService.speak).toHaveBeenCalledWith(expect.stringContaining('Run started'));
      
      // Verify haptic feedback was triggered
      const hapticService = serviceManager.services.haptic;
      expect(hapticService.playRunStartPattern).toHaveBeenCalled();
      
      // Verify location tracking started
      const locationService = serviceManager.services.location;
      expect(locationService.startTracking).toHaveBeenCalled();

      // Step 2: Simulate running for some time with location updates
      const mockLocations = [
        { latitude: 37.7749, longitude: -122.4194, timestamp: Date.now() },
        { latitude: 37.7750, longitude: -122.4195, timestamp: Date.now() + 30000 },
        { latitude: 37.7751, longitude: -122.4196, timestamp: Date.now() + 60000 },
      ];

      for (const location of mockLocations) {
        await serviceManager.services.runTracking.addLocationPoint(location);
      }

      // Verify metrics are being calculated
      const metrics = serviceManager.getCurrentRunMetrics();
      expect(metrics.distance).toBeGreaterThan(0);
      expect(metrics.duration).toBeGreaterThan(0);

      // Step 3: Pause the run
      await serviceManager.pauseRun();
      
      expect(serviceManager.isRunPaused()).toBe(true);
      expect(ttsService.speak).toHaveBeenCalledWith(expect.stringContaining('Run paused'));
      expect(hapticService.playRunPausePattern).toHaveBeenCalled();

      // Step 4: Resume the run
      await serviceManager.resumeRun();
      
      expect(serviceManager.isRunActive()).toBe(true);
      expect(serviceManager.isRunPaused()).toBe(false);
      expect(ttsService.speak).toHaveBeenCalledWith(expect.stringContaining('Run resumed'));
      expect(hapticService.playRunResumePattern).toHaveBeenCalled();

      // Step 5: Complete the run
      const completedRun = await serviceManager.stopRun();
      
      expect(completedRun.status).toBe('completed');
      expect(completedRun.endTime).toBeDefined();
      expect(serviceManager.isRunActive()).toBe(false);
      expect(ttsService.announceRunComplete).toHaveBeenCalledWith(completedRun);
      expect(hapticService.playRunCompletePattern).toHaveBeenCalled();

      // Step 6: Verify data persistence
      const savedRun = await serviceManager.getRunDetails(completedRun.id);
      expect(savedRun).toBeDefined();
      expect(savedRun!.id).toBe(completedRun.id);
      expect(savedRun!.totalDistance).toBe(completedRun.totalDistance);
      expect(savedRun!.totalDuration).toBe(completedRun.totalDuration);

      // Step 7: Verify run appears in history
      const runHistory = await serviceManager.getRunHistory();
      expect(runHistory).toContainEqual(expect.objectContaining({
        id: completedRun.id,
        status: 'completed'
      }));
    });

    it('should handle kilometer milestones with proper announcements and haptics', async () => {
      const ttsService = serviceManager.services.tts;
      const hapticService = serviceManager.services.haptic;
      
      // Start run
      await serviceManager.startRun();
      
      // Simulate reaching 1km
      const runTrackingService = serviceManager.services.runTracking;
      
      // Mock the split completion
      const mockSplitData = {
        splitNumber: 1,
        distance: 1000,
        duration: 300, // 5 minutes
        pace: 5.0
      };
      
      // Trigger split completion
      await runTrackingService.onSplitComplete!(mockSplitData);
      
      // Verify TTS announcement
      expect(ttsService.announceSplit).toHaveBeenCalledWith(mockSplitData);
      
      // Verify haptic feedback
      expect(hapticService.playKilometerPattern).toHaveBeenCalled();
      
      // Simulate reaching 500m mark
      await runTrackingService.onHalfKilometer!();
      
      // Verify half-kilometer haptic
      expect(hapticService.playHalfKilometerPattern).toHaveBeenCalled();
    });

    it('should handle auto-pause and auto-resume functionality', async () => {
      const ttsService = serviceManager.services.tts;
      const runTrackingService = serviceManager.services.runTracking;
      
      // Start run
      await serviceManager.startRun();
      
      // Simulate stopping (speed drops below threshold)
      const stationaryLocation = {
        latitude: 37.7749,
        longitude: -122.4194,
        speed: 0.5, // Below 1 km/h threshold
        timestamp: Date.now()
      };
      
      await runTrackingService.addLocationPoint(stationaryLocation);
      
      // Wait for auto-pause detection (simulate 30 seconds)
      jest.advanceTimersByTime(30000);
      
      // Verify auto-pause was triggered
      expect(serviceManager.isRunPaused()).toBe(true);
      expect(ttsService.speak).toHaveBeenCalledWith(expect.stringContaining('Auto-pause'));
      
      // Simulate resuming movement
      const movingLocation = {
        latitude: 37.7750,
        longitude: -122.4195,
        speed: 3.0, // Above 2 km/h threshold
        timestamp: Date.now() + 35000
      };
      
      await runTrackingService.addLocationPoint(movingLocation);
      
      // Verify auto-resume was triggered
      expect(serviceManager.isRunActive()).toBe(true);
      expect(serviceManager.isRunPaused()).toBe(false);
      expect(ttsService.speak).toHaveBeenCalledWith(expect.stringContaining('Auto-resume'));
    });
  });

  describe('SOS Integration Workflow', () => {
    it('should handle complete SOS workflow with emergency contacts', async () => {
      const sosService = serviceManager.services.sos;
      const ttsService = serviceManager.services.tts;
      const hapticService = serviceManager.services.haptic;
      
      // Set up emergency contacts
      const emergencyContact = {
        id: 1,
        name: 'Emergency Contact',
        phoneNumber: '+1234567890',
        isPrimary: true
      };
      
      await databaseService.addEmergencyContact(emergencyContact);
      
      // Start a run
      await serviceManager.startRun();
      
      // Trigger SOS
      await serviceManager.triggerSOS();
      
      // Verify SOS message was sent
      expect(sosService.sendSOSMessage).toHaveBeenCalledWith(
        expect.any(Object), // location
        'active run',
        expect.arrayContaining([emergencyContact])
      );
      
      // Verify confirmations
      expect(ttsService.speak).toHaveBeenCalledWith('SOS message sent to emergency contacts');
      expect(hapticService.playSOSConfirmationPattern).toHaveBeenCalled();
    });

    it('should handle SOS when no emergency contacts are configured', async () => {
      const ttsService = serviceManager.services.tts;
      
      // Trigger SOS without emergency contacts
      await serviceManager.triggerSOS();
      
      // Verify appropriate message
      expect(ttsService.speak).toHaveBeenCalledWith(
        'No emergency contacts configured. Please set up emergency contacts in settings.'
      );
    });

    it('should handle hardware button SOS trigger', async () => {
      const hardwareButtonService = serviceManager.services.hardwareButton;
      
      // Set up emergency contact
      await databaseService.addEmergencyContact({
        id: 1,
        name: 'Emergency Contact',
        phoneNumber: '+1234567890',
        isPrimary: true
      });
      
      // Start run to enable SOS monitoring
      await serviceManager.startRun();
      
      // Simulate hardware button long press
      await hardwareButtonService.onLongPress!();
      
      // Verify SOS was triggered
      const sosService = serviceManager.services.sos;
      expect(sosService.sendSOSMessage).toHaveBeenCalled();
    });
  });

  describe('Settings Integration Workflow', () => {
    it('should update settings across all services', async () => {
      const newSettings: Partial<AppSettings> = {
        announcementFrequencyMinutes: 10,
        hapticDistanceEnabled: false,
        voiceRate: 1.2
      };
      
      await serviceManager.updateSettings(newSettings);
      
      // Verify settings were propagated to services
      const ttsService = serviceManager.services.tts;
      const hapticService = serviceManager.services.haptic;
      const runTrackingService = serviceManager.services.runTracking;
      
      expect(ttsService.updateSettings).toHaveBeenCalledWith(
        expect.objectContaining(newSettings)
      );
      expect(hapticService.updateSettings).toHaveBeenCalledWith(
        expect.objectContaining(newSettings)
      );
      expect(runTrackingService.updateSettings).toHaveBeenCalledWith(
        expect.objectContaining(newSettings)
      );
      
      // Verify confirmation message
      expect(ttsService.speak).toHaveBeenCalledWith('Settings updated successfully');
    });
  });

  describe('Error Handling Integration', () => {
    it('should handle GPS signal loss gracefully', async () => {
      const locationService = serviceManager.services.location;
      const errorHandlingService = serviceManager.services.errorHandling;
      
      // Start run
      await serviceManager.startRun();
      
      // Simulate GPS signal loss
      const gpsError = new Error('GPS signal lost');
      locationService.getCurrentLocation.mockRejectedValue(gpsError);
      
      // Attempt to get location
      try {
        await locationService.getCurrentLocation();
      } catch (error) {
        // Error should be handled by error handling service
        expect(errorHandlingService.handleError).toHaveBeenCalledWith(
          gpsError,
          expect.any(String)
        );
      }
    });

    it('should handle TTS failures with fallback to haptic feedback', async () => {
      const ttsService = serviceManager.services.tts;
      const hapticService = serviceManager.services.haptic;
      
      // Mock TTS failure
      ttsService.speak.mockRejectedValue(new Error('TTS unavailable'));
      
      // Start run (should still work with haptic fallback)
      await serviceManager.startRun();
      
      // Verify haptic feedback still works
      expect(hapticService.playRunStartPattern).toHaveBeenCalled();
    });
  });

  describe('Background Task Integration', () => {
    it('should maintain run tracking when app is backgrounded', async () => {
      const backgroundTaskManager = serviceManager.services.backgroundTask;
      
      // Start run
      await serviceManager.startRun();
      
      // Verify background task was started
      expect(backgroundTaskManager.startRunTracking).toHaveBeenCalled();
      
      // Simulate app going to background
      await backgroundTaskManager.handleAppStateChange('background');
      
      // Verify tracking continues
      expect(backgroundTaskManager.isRunning()).toBe(true);
      
      // Stop run
      await serviceManager.stopRun();
      
      // Verify background task was stopped
      expect(backgroundTaskManager.stopRunTracking).toHaveBeenCalled();
    });
  });

  describe('Performance Integration', () => {
    it('should monitor performance during run and handle issues', async () => {
      const performanceService = serviceManager.services.performance;
      const errorHandlingService = serviceManager.services.errorHandling;
      
      // Start run
      await serviceManager.startRun();
      
      // Verify performance monitoring started
      expect(performanceService.startRunMonitoring).toHaveBeenCalled();
      
      // Simulate performance issue
      const performanceIssue = 'High memory usage detected';
      await performanceService.onPerformanceIssue!(performanceIssue);
      
      // Verify error handling was triggered
      expect(errorHandlingService.handleError).toHaveBeenCalledWith(
        expect.any(Error),
        'Performance issue detected'
      );
    });
  });

  describe('App State Restoration', () => {
    it('should restore active run after app restart', async () => {
      const runTrackingService = serviceManager.services.runTracking;
      const backgroundTaskManager = serviceManager.services.backgroundTask;
      const ttsService = serviceManager.services.tts;
      
      // Mock active run restoration
      runTrackingService.restoreActiveRun.mockResolvedValue(true);
      
      // Reinitialize service manager (simulating app restart)
      await serviceManager.initialize();
      
      // Verify active run was restored
      expect(runTrackingService.restoreActiveRun).toHaveBeenCalled();
      expect(backgroundTaskManager.resumeRunTracking).toHaveBeenCalled();
      expect(ttsService.speak).toHaveBeenCalledWith('Active run restored');
    });
  });
});