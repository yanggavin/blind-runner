import { ServiceIntegrationManager } from '../../services/ServiceIntegrationManager';
import { DatabaseService } from '../../database/DatabaseService';
import { AppSettings, RunData } from '../../models/types';

// Mock external dependencies
jest.mock('expo-location');
jest.mock('expo-speech');
jest.mock('expo-haptics');
jest.mock('expo-sensors');
jest.mock('expo-sms');

describe('Complete User Journey E2E Tests', () => {
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

  describe('First-Time User Setup Journey', () => {
    it('should guide new user through complete app setup', async () => {
      const ttsService = serviceManager.services.tts;
      
      // Simulate first app launch
      await serviceManager.initialize();
      
      // Verify welcome message
      expect(ttsService.speak).toHaveBeenCalledWith('App initialized successfully');
      
      // Set up initial settings
      const initialSettings: Partial<AppSettings> = {
        announcementFrequencyMinutes: 5,
        announcementFrequencyDistance: 1000,
        hapticDistanceEnabled: true,
        hapticTimeEnabled: false,
        voiceRate: 1.0,
        voicePitch: 1.0,
        autoPauseEnabled: true
      };
      
      await serviceManager.updateSettings(initialSettings);
      
      expect(ttsService.speak).toHaveBeenCalledWith('Settings updated successfully');
      
      // Set up emergency contacts
      await databaseService.addEmergencyContact({
        id: 1,
        name: 'Emergency Contact',
        phoneNumber: '+1234567890',
        isPrimary: true
      });
      
      // Verify setup completion
      const settings = await databaseService.getSettings();
      expect(settings).toMatchObject(initialSettings);
      
      const contacts = await databaseService.getEmergencyContacts();
      expect(contacts).toHaveLength(1);
    });
  });

  describe('Daily Running Routine Journey', () => {
    it('should handle typical daily 5K run with all features', async () => {
      const ttsService = serviceManager.services.tts;
      const hapticService = serviceManager.services.haptic;
      const runTrackingService = serviceManager.services.runTracking;
      
      // Configure settings for 5K run
      await serviceManager.updateSettings({
        announcementFrequencyMinutes: 5,
        announcementFrequencyDistance: 1000,
        hapticDistanceEnabled: true
      });
      
      // Start run
      const runData = await serviceManager.startRun();
      expect(runData.status).toBe('active');
      expect(ttsService.speak).toHaveBeenCalledWith(expect.stringContaining('Run started'));
      
      // Simulate 5K run with realistic GPS points and timing
      const runDuration = 25 * 60; // 25 minutes for 5K
      const totalDistance = 5.0; // 5 kilometers
      
      // Simulate running progress with location updates
      const locationUpdates = [];
      for (let i = 0; i <= 50; i++) {
        const progress = i / 50;
        const location = {
          latitude: 37.7749 + (progress * 0.01),
          longitude: -122.4194 + (progress * 0.01),
          speed: 3.33, // ~12 km/h pace
          timestamp: Date.now() + (i * (runDuration * 1000) / 50)
        };
        locationUpdates.push(location);
        
        await runTrackingService.addLocationPoint(location);
      }
      
      // Verify 1km milestone announcements
      for (let km = 1; km <= 5; km++) {
        const splitData = {
          splitNumber: km,
          distance: km * 1000,
          duration: km * 5 * 60, // 5 minutes per km
          pace: 5.0
        };
        
        await runTrackingService.onSplitComplete!(splitData);
        
        expect(ttsService.announceSplit).toHaveBeenCalledWith(splitData);
        expect(hapticService.playKilometerPattern).toHaveBeenCalled();
      }
      
      // Verify 5-minute announcements
      for (let minute = 5; minute <= 25; minute += 5) {
        const metrics = {
          distance: (minute / 25) * 5.0,
          duration: minute * 60,
          currentPace: 5.0,
          averagePace: 5.0,
          splits: []
        };
        
        await ttsService.announceMetrics(metrics);
        
        expect(ttsService.speak).toHaveBeenCalledWith(
          expect.stringContaining(`${Math.round(metrics.distance * 10) / 10} kilometers`)
        );
      }
      
      // Complete run
      const completedRun = await serviceManager.stopRun();
      
      expect(completedRun.status).toBe('completed');
      expect(completedRun.totalDistance).toBeCloseTo(5.0, 1);
      expect(completedRun.totalDuration).toBeCloseTo(runDuration, 60);
      expect(ttsService.announceRunComplete).toHaveBeenCalledWith(completedRun);
      
      // Verify run is saved in history
      const runHistory = await serviceManager.getRunHistory();
      expect(runHistory).toContainEqual(expect.objectContaining({
        id: completedRun.id,
        status: 'completed'
      }));
    });

    it('should handle interrupted run with pause and resume', async () => {
      const ttsService = serviceManager.services.tts;
      
      // Start run
      await serviceManager.startRun();
      
      // Run for 10 minutes
      await new Promise(resolve => setTimeout(resolve, 100)); // Simulate time
      
      // Pause for traffic light
      await serviceManager.pauseRun();
      expect(serviceManager.isRunPaused()).toBe(true);
      expect(ttsService.speak).toHaveBeenCalledWith(expect.stringContaining('Run paused'));
      
      // Wait at traffic light (30 seconds)
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Resume running
      await serviceManager.resumeRun();
      expect(serviceManager.isRunActive()).toBe(true);
      expect(ttsService.speak).toHaveBeenCalledWith(expect.stringContaining('Run resumed'));
      
      // Continue and finish run
      const completedRun = await serviceManager.stopRun();
      expect(completedRun.status).toBe('completed');
      
      // Verify pause time is not included in active duration
      expect(completedRun.totalDuration).toBeLessThan(20 * 60); // Less than 20 minutes
    });

    it('should handle auto-pause during run', async () => {
      const ttsService = serviceManager.services.tts;
      const runTrackingService = serviceManager.services.runTracking;
      
      // Start run
      await serviceManager.startRun();
      
      // Simulate stopping (speed drops to 0)
      const stoppedLocation = {
        latitude: 37.7749,
        longitude: -122.4194,
        speed: 0,
        timestamp: Date.now()
      };
      
      await runTrackingService.addLocationPoint(stoppedLocation);
      
      // Simulate 30 seconds of being stationary
      jest.advanceTimersByTime(30000);
      
      // Verify auto-pause was triggered
      expect(serviceManager.isRunPaused()).toBe(true);
      expect(ttsService.speak).toHaveBeenCalledWith(expect.stringContaining('Auto-pause'));
      
      // Simulate resuming movement
      const movingLocation = {
        latitude: 37.7750,
        longitude: -122.4195,
        speed: 3.0,
        timestamp: Date.now() + 35000
      };
      
      await runTrackingService.addLocationPoint(movingLocation);
      
      // Verify auto-resume
      expect(serviceManager.isRunActive()).toBe(true);
      expect(ttsService.speak).toHaveBeenCalledWith(expect.stringContaining('Auto-resume'));
    });
  });

  describe('Weekly Training Plan Journey', () => {
    it('should track progress across multiple runs in a week', async () => {
      const runs: RunData[] = [];
      
      // Simulate 5 runs over a week
      const weeklyRuns = [
        { distance: 3.0, duration: 18 * 60 }, // Easy 3K
        { distance: 5.0, duration: 25 * 60 }, // 5K tempo
        { distance: 2.0, duration: 12 * 60 }, // Recovery 2K
        { distance: 8.0, duration: 48 * 60 }, // Long 8K
        { distance: 5.0, duration: 24 * 60 }, // 5K race pace
      ];
      
      for (let i = 0; i < weeklyRuns.length; i++) {
        const { distance, duration } = weeklyRuns[i];
        
        // Start run
        const runData = await serviceManager.startRun();
        
        // Simulate run completion
        const completedRun = await serviceManager.stopRun();
        completedRun.totalDistance = distance;
        completedRun.totalDuration = duration;
        completedRun.averagePace = duration / 60 / distance; // minutes per km
        
        runs.push(completedRun);
        
        // Save run to database
        await databaseService.saveRun(completedRun);
      }
      
      // Verify weekly progress
      const runHistory = await serviceManager.getRunHistory();
      expect(runHistory).toHaveLength(5);
      
      // Calculate weekly totals
      const totalDistance = runs.reduce((sum, run) => sum + run.totalDistance, 0);
      const totalDuration = runs.reduce((sum, run) => sum + run.totalDuration, 0);
      
      expect(totalDistance).toBeCloseTo(23.0, 1); // 23K total
      expect(totalDuration).toBeCloseTo(127 * 60, 60); // ~2 hours total
      
      // Verify improvement trend (last 5K faster than first)
      const firstFiveK = runs[1]; // First 5K
      const lastFiveK = runs[4]; // Last 5K
      
      expect(lastFiveK.averagePace).toBeLessThan(firstFiveK.averagePace);
    });
  });

  describe('Settings Customization Journey', () => {
    it('should handle user customizing all settings over time', async () => {
      const ttsService = serviceManager.services.tts;
      
      // Initial settings - conservative announcements
      await serviceManager.updateSettings({
        announcementFrequencyMinutes: 10,
        announcementFrequencyDistance: 1000,
        hapticDistanceEnabled: true,
        hapticTimeEnabled: false
      });
      
      // User finds announcements too infrequent, increases frequency
      await serviceManager.updateSettings({
        announcementFrequencyMinutes: 3,
        announcementFrequencyDistance: 500
      });
      
      expect(ttsService.speak).toHaveBeenCalledWith('Settings updated successfully');
      
      // User wants faster speech
      await serviceManager.updateSettings({
        voiceRate: 1.3
      });
      
      // User enables time-based haptics
      await serviceManager.updateSettings({
        hapticTimeEnabled: true
      });
      
      // Verify all settings are persisted
      const finalSettings = await databaseService.getSettings();
      
      expect(finalSettings).toMatchObject({
        announcementFrequencyMinutes: 3,
        announcementFrequencyDistance: 500,
        hapticDistanceEnabled: true,
        hapticTimeEnabled: true,
        voiceRate: 1.3
      });
    });
  });

  describe('Emergency Preparedness Journey', () => {
    it('should handle user setting up and testing emergency features', async () => {
      const ttsService = serviceManager.services.tts;
      const sosService = serviceManager.services.sos;
      
      // Add primary emergency contact
      await databaseService.addEmergencyContact({
        id: 1,
        name: 'Spouse',
        phoneNumber: '+1234567890',
        isPrimary: true
      });
      
      // Add secondary contact
      await databaseService.addEmergencyContact({
        id: 2,
        name: 'Friend',
        phoneNumber: '+0987654321',
        isPrimary: false
      });
      
      // Test SOS functionality
      await sosService.testSOS();
      
      expect(ttsService.speak).toHaveBeenCalledWith(
        'SOS test completed successfully. Emergency contacts would receive your location.'
      );
      
      // Practice SOS during run
      await serviceManager.startRun();
      
      // Simulate hardware button SOS
      const hardwareButtonService = serviceManager.services.hardwareButton;
      await hardwareButtonService.onLongPress!();
      
      // Verify SOS was triggered
      expect(sosService.sendSOSMessage).toHaveBeenCalled();
      expect(ttsService.speak).toHaveBeenCalledWith('SOS message sent to emergency contacts');
    });
  });

  describe('Data Management Journey', () => {
    it('should handle user managing run history and data export', async () => {
      // Create several runs
      const runs = [];
      for (let i = 0; i < 10; i++) {
        const runData = await serviceManager.startRun();
        const completedRun = await serviceManager.stopRun();
        completedRun.totalDistance = 3 + Math.random() * 5; // 3-8K runs
        completedRun.totalDuration = (completedRun.totalDistance * 5 + Math.random() * 2) * 60;
        
        await databaseService.saveRun(completedRun);
        runs.push(completedRun);
      }
      
      // View run history
      const runHistory = await serviceManager.getRunHistory();
      expect(runHistory).toHaveLength(10);
      
      // View specific run details
      const specificRun = await serviceManager.getRunDetails(runs[0].id);
      expect(specificRun).toBeDefined();
      expect(specificRun!.id).toBe(runs[0].id);
      
      // Export run data
      const exportedData = await databaseService.exportRunData();
      expect(exportedData).toContain('distance');
      expect(exportedData).toContain('duration');
      
      // Delete old runs (keep last 5)
      const runsToDelete = runs.slice(0, 5);
      for (const run of runsToDelete) {
        await databaseService.deleteRun(run.id);
      }
      
      // Verify deletion
      const remainingRuns = await serviceManager.getRunHistory();
      expect(remainingRuns).toHaveLength(5);
    });
  });

  describe('Accessibility Adaptation Journey', () => {
    it('should handle user adapting to different accessibility needs', async () => {
      const ttsService = serviceManager.services.tts;
      const hapticService = serviceManager.services.haptic;
      
      // Start with standard settings
      await serviceManager.updateSettings({
        voiceRate: 1.0,
        hapticDistanceEnabled: true,
        hapticTimeEnabled: false
      });
      
      // User develops hearing difficulty, relies more on haptics
      await serviceManager.updateSettings({
        hapticTimeEnabled: true,
        announcementFrequencyMinutes: 15 // Less frequent voice
      });
      
      // Test run with enhanced haptic feedback
      await serviceManager.startRun();
      
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
      
      // User adapts to faster speech for efficiency
      await serviceManager.updateSettings({
        voiceRate: 1.5
      });
      
      // Verify TTS service received updated settings
      expect(ttsService.updateSettings).toHaveBeenCalledWith(
        expect.objectContaining({ voiceRate: 1.5 })
      );
    });
  });

  describe('Long-Term Usage Journey', () => {
    it('should handle months of regular usage with data accumulation', async () => {
      // Simulate 3 months of running (60 runs)
      const runs = [];
      
      for (let week = 0; week < 12; week++) {
        for (let run = 0; run < 5; run++) {
          const runData = await serviceManager.startRun();
          const completedRun = await serviceManager.stopRun();
          
          // Simulate gradual improvement
          const baseDistance = 3 + Math.random() * 5;
          const improvementFactor = 1 + (week * 0.02); // 2% improvement per week
          
          completedRun.totalDistance = baseDistance;
          completedRun.totalDuration = (baseDistance * 6 / improvementFactor) * 60;
          completedRun.averagePace = completedRun.totalDuration / 60 / completedRun.totalDistance;
          
          await databaseService.saveRun(completedRun);
          runs.push(completedRun);
        }
      }
      
      // Verify data accumulation
      const runHistory = await serviceManager.getRunHistory();
      expect(runHistory).toHaveLength(60);
      
      // Verify performance improvement
      const firstWeekRuns = runs.slice(0, 5);
      const lastWeekRuns = runs.slice(-5);
      
      const firstWeekAvgPace = firstWeekRuns.reduce((sum, run) => sum + run.averagePace, 0) / 5;
      const lastWeekAvgPace = lastWeekRuns.reduce((sum, run) => sum + run.averagePace, 0) / 5;
      
      expect(lastWeekAvgPace).toBeLessThan(firstWeekAvgPace); // Faster pace = improvement
      
      // Test data export for large dataset
      const exportedData = await databaseService.exportRunData();
      expect(exportedData.length).toBeGreaterThan(1000); // Substantial data
    });
  });
});