import { ServiceIntegrationManager } from '../../services/ServiceIntegrationManager';
import { DatabaseService } from '../../database/DatabaseService';
import { EmergencyContact } from '../../models/types';

// Mock external dependencies
jest.mock('expo-sms');
jest.mock('expo-location');
jest.mock('expo-speech');
jest.mock('expo-haptics');

describe('Emergency Scenarios E2E Tests', () => {
  let serviceManager: ServiceIntegrationManager;
  let databaseService: DatabaseService;

  beforeEach(async () => {
    jest.clearAllMocks();
    
    serviceManager = ServiceIntegrationManager.getInstance();
    databaseService = new DatabaseService();
    
    await serviceManager.initialize();
  });

  afterEach(async () => {
    await serviceManager.cleanup();
  });

  describe('SOS Activation Scenarios', () => {
    it('should handle SOS during active run with location and run status', async () => {
      const sosService = serviceManager.services.sos;
      const locationService = serviceManager.services.location;
      const ttsService = serviceManager.services.tts;
      
      // Set up emergency contacts
      const emergencyContacts: EmergencyContact[] = [
        {
          id: 1,
          name: 'Primary Contact',
          phoneNumber: '+1234567890',
          isPrimary: true
        },
        {
          id: 2,
          name: 'Secondary Contact',
          phoneNumber: '+0987654321',
          isPrimary: false
        }
      ];
      
      for (const contact of emergencyContacts) {
        await databaseService.addEmergencyContact(contact);
      }
      
      // Mock current location
      const mockLocation = {
        latitude: 37.7749,
        longitude: -122.4194,
        accuracy: 5,
        timestamp: Date.now()
      };
      
      locationService.getCurrentLocation.mockResolvedValue(mockLocation);
      
      // Start a run
      await serviceManager.startRun();
      
      // Simulate some running progress
      const runMetrics = {
        distance: 2.5,
        duration: 900, // 15 minutes
        currentPace: 6.0,
        averagePace: 6.0,
        splits: []
      };
      
      serviceManager.services.runTracking.getCurrentMetrics.mockReturnValue(runMetrics);
      
      // Trigger SOS
      await serviceManager.triggerSOS();
      
      // Verify SOS message includes run status
      expect(sosService.sendSOSMessage).toHaveBeenCalledWith(
        mockLocation,
        'active run',
        emergencyContacts
      );
      
      // Verify confirmations
      expect(ttsService.speak).toHaveBeenCalledWith('SOS message sent to emergency contacts');
      
      // Verify haptic confirmation
      const hapticService = serviceManager.services.haptic;
      expect(hapticService.playSOSConfirmationPattern).toHaveBeenCalled();
    });

    it('should handle SOS when not running', async () => {
      const sosService = serviceManager.services.sos;
      const locationService = serviceManager.services.location;
      
      // Set up emergency contact
      await databaseService.addEmergencyContact({
        id: 1,
        name: 'Emergency Contact',
        phoneNumber: '+1234567890',
        isPrimary: true
      });
      
      // Mock current location
      const mockLocation = {
        latitude: 37.7749,
        longitude: -122.4194,
        accuracy: 5,
        timestamp: Date.now()
      };
      
      locationService.getCurrentLocation.mockResolvedValue(mockLocation);
      
      // Trigger SOS without active run
      await serviceManager.triggerSOS();
      
      // Verify SOS message indicates no active run
      expect(sosService.sendSOSMessage).toHaveBeenCalledWith(
        mockLocation,
        'not running',
        expect.any(Array)
      );
    });

    it('should handle hardware button SOS trigger during run', async () => {
      const hardwareButtonService = serviceManager.services.hardwareButton;
      const sosService = serviceManager.services.sos;
      
      // Set up emergency contact
      await databaseService.addEmergencyContact({
        id: 1,
        name: 'Emergency Contact',
        phoneNumber: '+1234567890',
        isPrimary: true
      });
      
      // Start run (enables SOS monitoring)
      await serviceManager.startRun();
      
      // Verify SOS monitoring is enabled
      expect(hardwareButtonService.enableSOSMonitoring).toHaveBeenCalled();
      
      // Simulate hardware button long press
      await hardwareButtonService.onLongPress!();
      
      // Verify SOS was triggered
      expect(sosService.sendSOSMessage).toHaveBeenCalled();
      
      // Stop run
      await serviceManager.stopRun();
      
      // Verify SOS monitoring is disabled
      expect(hardwareButtonService.disableSOSMonitoring).toHaveBeenCalled();
    });

    it('should handle multiple SOS triggers with rate limiting', async () => {
      const sosService = serviceManager.services.sos;
      const ttsService = serviceManager.services.tts;
      
      // Set up emergency contact
      await databaseService.addEmergencyContact({
        id: 1,
        name: 'Emergency Contact',
        phoneNumber: '+1234567890',
        isPrimary: true
      });
      
      // First SOS trigger
      await serviceManager.triggerSOS();
      expect(sosService.sendSOSMessage).toHaveBeenCalledTimes(1);
      
      // Immediate second trigger (should be rate limited)
      await serviceManager.triggerSOS();
      
      // Verify rate limiting message
      expect(ttsService.speak).toHaveBeenCalledWith(
        expect.stringContaining('SOS recently sent')
      );
      
      // Verify second message wasn't sent immediately
      expect(sosService.sendSOSMessage).toHaveBeenCalledTimes(1);
    });
  });

  describe('SOS Error Scenarios', () => {
    it('should handle SOS when no emergency contacts are configured', async () => {
      const ttsService = serviceManager.services.tts;
      const sosService = serviceManager.services.sos;
      
      // Trigger SOS without emergency contacts
      await serviceManager.triggerSOS();
      
      // Verify appropriate error message
      expect(ttsService.speak).toHaveBeenCalledWith(
        'No emergency contacts configured. Please set up emergency contacts in settings.'
      );
      
      // Verify no SOS message was sent
      expect(sosService.sendSOSMessage).not.toHaveBeenCalled();
    });

    it('should handle SOS when location is unavailable', async () => {
      const locationService = serviceManager.services.location;
      const ttsService = serviceManager.services.tts;
      const errorHandlingService = serviceManager.services.errorHandling;
      
      // Set up emergency contact
      await databaseService.addEmergencyContact({
        id: 1,
        name: 'Emergency Contact',
        phoneNumber: '+1234567890',
        isPrimary: true
      });
      
      // Mock location error
      const locationError = new Error('Location unavailable');
      locationService.getCurrentLocation.mockRejectedValue(locationError);
      
      // Trigger SOS
      await serviceManager.triggerSOS();
      
      // Verify error handling
      expect(errorHandlingService.handleError).toHaveBeenCalledWith(
        locationError,
        'SOS activation failed'
      );
      
      // Verify error message
      expect(ttsService.speak).toHaveBeenCalledWith(
        'SOS activation failed. Please try again or contact emergency services directly.'
      );
    });

    it('should handle SOS when SMS sending fails', async () => {
      const sosService = serviceManager.services.sos;
      const ttsService = serviceManager.services.tts;
      const errorHandlingService = serviceManager.services.errorHandling;
      
      // Set up emergency contact
      await databaseService.addEmergencyContact({
        id: 1,
        name: 'Emergency Contact',
        phoneNumber: '+1234567890',
        isPrimary: true
      });
      
      // Mock SMS sending failure
      const smsError = new Error('SMS sending failed');
      sosService.sendSOSMessage.mockRejectedValue(smsError);
      
      // Trigger SOS
      await serviceManager.triggerSOS();
      
      // Verify error handling
      expect(errorHandlingService.handleError).toHaveBeenCalledWith(
        smsError,
        'SOS activation failed'
      );
      
      // Verify fallback message
      expect(ttsService.speak).toHaveBeenCalledWith(
        'SOS activation failed. Please try again or contact emergency services directly.'
      );
    });

    it('should handle SOS when device has no cellular service', async () => {
      const sosService = serviceManager.services.sos;
      const offlineDataService = serviceManager.services.offlineData;
      const ttsService = serviceManager.services.tts;
      
      // Set up emergency contact
      await databaseService.addEmergencyContact({
        id: 1,
        name: 'Emergency Contact',
        phoneNumber: '+1234567890',
        isPrimary: true
      });
      
      // Mock no cellular service
      const networkError = new Error('No network connection');
      sosService.sendSOSMessage.mockRejectedValue(networkError);
      
      // Trigger SOS
      await serviceManager.triggerSOS();
      
      // Verify SOS is queued for later sending
      expect(offlineDataService.queueSOSMessage).toHaveBeenCalled();
      
      // Verify user is informed
      expect(ttsService.speak).toHaveBeenCalledWith(
        expect.stringContaining('queued')
      );
    });
  });

  describe('Emergency Contact Management', () => {
    it('should validate emergency contact phone numbers', async () => {
      const ttsService = serviceManager.services.tts;
      
      // Attempt to add invalid phone number
      const invalidContact = {
        id: 1,
        name: 'Invalid Contact',
        phoneNumber: 'invalid-phone',
        isPrimary: true
      };
      
      try {
        await databaseService.addEmergencyContact(invalidContact);
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain('Invalid phone number');
      }
    });

    it('should handle SOS test mode', async () => {
      const sosService = serviceManager.services.sos;
      const ttsService = serviceManager.services.tts;
      
      // Set up emergency contact
      await databaseService.addEmergencyContact({
        id: 1,
        name: 'Emergency Contact',
        phoneNumber: '+1234567890',
        isPrimary: true
      });
      
      // Trigger SOS in test mode
      await sosService.testSOS();
      
      // Verify test message
      expect(ttsService.speak).toHaveBeenCalledWith(
        'SOS test completed successfully. Emergency contacts would receive your location.'
      );
      
      // Verify no actual message was sent
      expect(sosService.sendSOSMessage).not.toHaveBeenCalled();
    });
  });

  describe('Emergency Scenarios During Different App States', () => {
    it('should handle SOS when app is backgrounded during run', async () => {
      const backgroundTaskManager = serviceManager.services.backgroundTask;
      const sosService = serviceManager.services.sos;
      
      // Set up emergency contact
      await databaseService.addEmergencyContact({
        id: 1,
        name: 'Emergency Contact',
        phoneNumber: '+1234567890',
        isPrimary: true
      });
      
      // Start run
      await serviceManager.startRun();
      
      // Simulate app going to background
      await backgroundTaskManager.handleAppStateChange('background');
      
      // Trigger SOS (should still work in background)
      await serviceManager.triggerSOS();
      
      // Verify SOS was sent
      expect(sosService.sendSOSMessage).toHaveBeenCalled();
    });

    it('should handle SOS when app is killed and restored', async () => {
      const runTrackingService = serviceManager.services.runTracking;
      const sosService = serviceManager.services.sos;
      
      // Set up emergency contact
      await databaseService.addEmergencyContact({
        id: 1,
        name: 'Emergency Contact',
        phoneNumber: '+1234567890',
        isPrimary: true
      });
      
      // Mock active run restoration
      runTrackingService.restoreActiveRun.mockResolvedValue(true);
      
      // Reinitialize (simulating app restart)
      await serviceManager.initialize();
      
      // Verify SOS monitoring is restored for active run
      const hardwareButtonService = serviceManager.services.hardwareButton;
      expect(hardwareButtonService.enableSOSMonitoring).toHaveBeenCalled();
      
      // Trigger SOS
      await serviceManager.triggerSOS();
      
      // Verify SOS works after restoration
      expect(sosService.sendSOSMessage).toHaveBeenCalled();
    });
  });

  describe('Emergency Data Persistence', () => {
    it('should save SOS events for later review', async () => {
      const sosService = serviceManager.services.sos;
      
      // Set up emergency contact
      await databaseService.addEmergencyContact({
        id: 1,
        name: 'Emergency Contact',
        phoneNumber: '+1234567890',
        isPrimary: true
      });
      
      // Trigger SOS
      await serviceManager.triggerSOS();
      
      // Verify SOS event is logged
      expect(databaseService.logSOSEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          timestamp: expect.any(Number),
          location: expect.any(Object),
          runStatus: expect.any(String),
          contactsNotified: expect.any(Array)
        })
      );
    });

    it('should handle emergency contact backup and restore', async () => {
      const emergencyContacts = [
        {
          id: 1,
          name: 'Primary Contact',
          phoneNumber: '+1234567890',
          isPrimary: true
        },
        {
          id: 2,
          name: 'Secondary Contact',
          phoneNumber: '+0987654321',
          isPrimary: false
        }
      ];
      
      // Add contacts
      for (const contact of emergencyContacts) {
        await databaseService.addEmergencyContact(contact);
      }
      
      // Export emergency data
      const exportedData = await databaseService.exportEmergencyData();
      
      expect(exportedData).toContain('Primary Contact');
      expect(exportedData).toContain('Secondary Contact');
      
      // Clear contacts
      await databaseService.clearEmergencyContacts();
      
      // Restore from backup
      await databaseService.importEmergencyData(exportedData);
      
      // Verify contacts are restored
      const restoredContacts = await databaseService.getEmergencyContacts();
      expect(restoredContacts).toHaveLength(2);
    });
  });
});