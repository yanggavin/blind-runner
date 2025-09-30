import { ServiceIntegrationManager } from '../../services/ServiceIntegrationManager';
import { DatabaseService } from '../../database/DatabaseService';

// Mock all external dependencies
jest.mock('expo-location');
jest.mock('expo-speech');
jest.mock('expo-haptics');
jest.mock('expo-sensors');
jest.mock('expo-sms');
jest.mock('expo-task-manager');

describe('Service Integration Tests', () => {
  let serviceManager: ServiceIntegrationManager;

  beforeEach(async () => {
    jest.clearAllMocks();
    
    // Get fresh instance
    serviceManager = ServiceIntegrationManager.getInstance();
    
    // Initialize all services
    await serviceManager.initialize();
  });

  afterEach(async () => {
    await serviceManager.cleanup();
  });

  describe('Service Initialization Integration', () => {
    it('should initialize all services in correct order', async () => {
      const services = serviceManager.services;
      
      // Verify all services are initialized
      expect(services.database.initialize).toHaveBeenCalled();
      expect(services.location.initialize).toHaveBeenCalled();
      expect(services.tts.initialize).toHaveBeenCalled();
      expect(services.haptic.initialize).toHaveBeenCalled();
      expect(services.runTracking.initialize).toHaveBeenCalled();
      expect(services.sos.initialize).toHaveBeenCalled();
      expect(services.hardwareButton.initialize).toHaveBeenCalled();
      expect(services.backgroundTask.initialize).toHaveBeenCalled();
      expect(services.offlineData.initialize).toHaveBeenCalled();
      expect(services.performance.initialize).toHaveBeenCalled();
    });

    it('should handle service initialization failures gracefully', async () => {
      const errorHandlingService = serviceManager.services.errorHandling;
      
      // Mock a service initialization failure
      const locationService = serviceManager.services.location;
      locationService.initialize.mockRejectedValue(new Error('Location service failed'));
      
      // Attempt to initialize
      try {
        await serviceManager.initialize();
      } catch (error) {
        // Verify error was handled
        expect(errorHandlingService.handleError).toHaveBeenCalledWith(
          expect.any(Error),
          'Service initialization failed'
        );
      }
    });
  });

  describe('Cross-Service Communication', () => {
    it('should properly connect run tracking events to TTS and haptic services', async () => {
      const runTrackingService = serviceManager.services.runTracking;
      const ttsService = serviceManager.services.tts;
      const hapticService = serviceManager.services.haptic;
      
      // Verify event handlers are set up
      expect(runTrackingService.onRunStart).toBeDefined();
      expect(runTrackingService.onRunPause).toBeDefined();
      expect(runTrackingService.onRunResume).toBeDefined();
      expect(runTrackingService.onRunComplete).toBeDefined();
      expect(runTrackingService.onSplitComplete).toBeDefined();
      
      // Test run start event
      const mockRunData = {
        id: 1,
        startTime: new Date(),
        status: 'active' as const,
        totalDistance: 0,
        totalDuration: 0,
        averagePace: 0,
        splits: [],
        trackPoints: []
      };
      
      await runTrackingService.onRunStart!(mockRunData);
      
      expect(ttsService.announceRunStart).toHaveBeenCalled();
      expect(hapticService.playRunStartPattern).toHaveBeenCalled();
    });

    it('should connect location updates to run tracking', async () => {
      const locationService = serviceManager.services.location;
      const runTrackingService = serviceManager.services.runTracking;
      
      // Verify location update handler is set
      expect(locationService.onLocationUpdate).toBeDefined();
      
      // Mock active run
      runTrackingService.isRunning.mockReturnValue(true);
      
      // Simulate location update
      const mockLocation = {
        latitude: 37.7749,
        longitude: -122.4194,
        accuracy: 5,
        timestamp: Date.now()
      };
      
      locationService.onLocationUpdate!(mockLocation);
      
      expect(runTrackingService.addLocationPoint).toHaveBeenCalledWith(mockLocation);
    });

    it('should connect hardware button events to SOS service', async () => {
      const hardwareButtonService = serviceManager.services.hardwareButton;
      
      // Verify SOS handler is set
      expect(hardwareButtonService.onLongPress).toBeDefined();
      
      // Mock emergency contact
      const databaseService = serviceManager.services.database;
      databaseService.getEmergencyContacts.mockResolvedValue([{
        id: 1,
        name: 'Emergency Contact',
        phoneNumber: '+1234567890',
        isPrimary: true
      }]);
      
      // Trigger hardware button long press
      await hardwareButtonService.onLongPress!();
      
      // Verify SOS was triggered
      const sosService = serviceManager.services.sos;
      expect(sosService.sendSOSMessage).toHaveBeenCalled();
    });
  });

  describe('Settings Propagation Integration', () => {
    it('should propagate settings changes to all relevant services', async () => {
      const newSettings = {
        announcementFrequencyMinutes: 3,
        hapticDistanceEnabled: false,
        voiceRate: 1.5,
        autoPauseEnabled: false
      };
      
      await serviceManager.updateSettings(newSettings);
      
      // Verify settings were propagated
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
    });
  });

  describe('Background Task Integration', () => {
    it('should coordinate background tasks with run tracking', async () => {
      const backgroundTaskManager = serviceManager.services.backgroundTask;
      const performanceService = serviceManager.services.performance;
      
      // Start run
      await serviceManager.startRun();
      
      // Verify background tasks are started
      expect(backgroundTaskManager.startRunTracking).toHaveBeenCalled();
      expect(performanceService.startRunMonitoring).toHaveBeenCalled();
      
      // Stop run
      await serviceManager.stopRun();
      
      // Verify background tasks are stopped
      expect(backgroundTaskManager.stopRunTracking).toHaveBeenCalled();
      expect(performanceService.stopRunMonitoring).toHaveBeenCalled();
    });
  });

  describe('Error Handling Integration', () => {
    it('should handle errors across all service boundaries', async () => {
      const errorHandlingService = serviceManager.services.errorHandling;
      
      // Mock various service errors
      const locationService = serviceManager.services.location;
      const ttsService = serviceManager.services.tts;
      
      const locationError = new Error('GPS signal lost');
      const ttsError = new Error('TTS unavailable');
      
      locationService.getCurrentLocation.mockRejectedValue(locationError);
      ttsService.speak.mockRejectedValue(ttsError);
      
      // Attempt operations that will fail
      try {
        await locationService.getCurrentLocation();
      } catch (error) {
        // Error should be handled
        expect(errorHandlingService.handleError).toHaveBeenCalledWith(
          locationError,
          expect.any(String)
        );
      }
      
      try {
        await ttsService.speak('test');
      } catch (error) {
        // Error should be handled
        expect(errorHandlingService.handleError).toHaveBeenCalledWith(
          ttsError,
          expect.any(String)
        );
      }
    });
  });

  describe('Performance Monitoring Integration', () => {
    it('should monitor performance across all services', async () => {
      const performanceService = serviceManager.services.performance;
      const errorHandlingService = serviceManager.services.errorHandling;
      
      // Start run to begin performance monitoring
      await serviceManager.startRun();
      
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

  describe('Data Persistence Integration', () => {
    it('should ensure data consistency across all services', async () => {
      const databaseService = serviceManager.services.database;
      
      // Start and complete a run
      const runData = await serviceManager.startRun();
      const completedRun = await serviceManager.stopRun();
      
      // Verify run was saved
      expect(databaseService.saveRun).toHaveBeenCalledWith(completedRun);
      
      // Update settings
      const newSettings = { voiceRate: 1.2 };
      await serviceManager.updateSettings(newSettings);
      
      // Verify settings were saved
      expect(databaseService.updateSettings).toHaveBeenCalledWith(
        expect.objectContaining(newSettings)
      );
    });
  });

  describe('Offline Data Integration', () => {
    it('should handle offline scenarios across all services', async () => {
      const offlineDataService = serviceManager.services.offlineData;
      const sosService = serviceManager.services.sos;
      
      // Mock network unavailable
      const networkError = new Error('No network connection');
      sosService.sendSOSMessage.mockRejectedValue(networkError);
      
      // Set up emergency contact
      const databaseService = serviceManager.services.database;
      databaseService.getEmergencyContacts.mockResolvedValue([{
        id: 1,
        name: 'Emergency Contact',
        phoneNumber: '+1234567890',
        isPrimary: true
      }]);
      
      // Trigger SOS
      await serviceManager.triggerSOS();
      
      // Verify SOS was queued for offline handling
      expect(offlineDataService.queueSOSMessage).toHaveBeenCalled();
    });
  });

  describe('State Restoration Integration', () => {
    it('should restore app state across all services after restart', async () => {
      const runTrackingService = serviceManager.services.runTracking;
      const backgroundTaskManager = serviceManager.services.backgroundTask;
      const hardwareButtonService = serviceManager.services.hardwareButton;
      
      // Mock active run restoration
      runTrackingService.restoreActiveRun.mockResolvedValue(true);
      
      // Reinitialize (simulating app restart)
      await serviceManager.initialize();
      
      // Verify active run restoration
      expect(runTrackingService.restoreActiveRun).toHaveBeenCalled();
      expect(backgroundTaskManager.resumeRunTracking).toHaveBeenCalled();
      expect(hardwareButtonService.enableSOSMonitoring).toHaveBeenCalled();
    });
  });

  describe('Cleanup Integration', () => {
    it('should properly cleanup all services', async () => {
      const services = serviceManager.services;
      
      // Start some operations
      await serviceManager.startRun();
      
      // Cleanup
      await serviceManager.cleanup();
      
      // Verify all services are cleaned up
      expect(services.backgroundTask.cleanup).toHaveBeenCalled();
      expect(services.location.cleanup).toHaveBeenCalled();
      expect(services.hardwareButton.cleanup).toHaveBeenCalled();
      expect(services.performance.cleanup).toHaveBeenCalled();
    });
  });
});