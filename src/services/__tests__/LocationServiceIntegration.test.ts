import { LocationServiceImpl } from '../LocationService';
import { DatabaseService } from '../../database';
import { MotionState } from '../interfaces';

// Mock dependencies
jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(),
  requestBackgroundPermissionsAsync: jest.fn(),
  watchPositionAsync: jest.fn(),
  startLocationUpdatesAsync: jest.fn(),
  stopLocationUpdatesAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  Accuracy: {
    BestForNavigation: 6,
  },
}));

jest.mock('expo-task-manager', () => ({
  isTaskRegisteredAsync: jest.fn(),
  defineTask: jest.fn(),
}));

jest.mock('react-native-mmkv', () => ({
  MMKV: jest.fn().mockImplementation(() => ({
    set: jest.fn(),
    getNumber: jest.fn(),
    delete: jest.fn(),
  })),
}));

jest.mock('../../database', () => ({
  DatabaseService: {
    getInstance: jest.fn(),
  },
}));

const mockDatabaseService = DatabaseService as jest.Mocked<typeof DatabaseService>;

describe('LocationService GPS Integration', () => {
  let locationService: LocationServiceImpl;
  let mockDb: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    locationService = new LocationServiceImpl();
    
    // Mock database instance
    mockDb = {
      addTrackPoint: jest.fn().mockResolvedValue(1),
      createRun: jest.fn().mockResolvedValue(1),
      updateRun: jest.fn().mockResolvedValue(undefined),
      getActiveRun: jest.fn().mockResolvedValue(null),
    };
    mockDatabaseService.getInstance.mockResolvedValue(mockDb);
  });

  describe('Distance Calculation', () => {
    it('should calculate distance between two GPS points using Haversine formula', () => {
      const point1 = { 
        latitude: 37.7749, 
        longitude: -122.4194, 
        timestamp: new Date() 
      };
      const point2 = { 
        latitude: 37.7849, 
        longitude: -122.4194, 
        timestamp: new Date() 
      };

      const distance = locationService.calculateDistance([point1, point2]);
      
      // Distance should be approximately 1.11 km (1110 meters)
      // Using Haversine formula for San Francisco coordinates
      expect(distance).toBeGreaterThan(1000);
      expect(distance).toBeLessThan(1200);
    });

    it('should return 0 for single point', () => {
      const point = { 
        latitude: 37.7749, 
        longitude: -122.4194, 
        timestamp: new Date() 
      };

      const distance = locationService.calculateDistance([point]);
      expect(distance).toBe(0);
    });

    it('should calculate cumulative distance for multiple points', () => {
      const points = [
        { latitude: 37.7749, longitude: -122.4194, timestamp: new Date() },
        { latitude: 37.7759, longitude: -122.4194, timestamp: new Date() },
        { latitude: 37.7769, longitude: -122.4194, timestamp: new Date() },
      ];

      const distance = locationService.calculateDistance(points);
      
      // Should be approximately 222 meters (0.222 km)
      expect(distance).toBeGreaterThan(200);
      expect(distance).toBeLessThan(250);
    });
  });

  describe('Motion State Detection', () => {
    it('should detect stationary state for same coordinates', () => {
      const baseTime = Date.now();
      const stationaryLocations = [
        { latitude: 37.7749, longitude: -122.4194, timestamp: new Date(baseTime) },
        { latitude: 37.7749, longitude: -122.4194, timestamp: new Date(baseTime + 1000) },
        { latitude: 37.7749, longitude: -122.4194, timestamp: new Date(baseTime + 2000) },
      ];

      // Set location history directly for testing
      (locationService as any).locationHistory = stationaryLocations;
      (locationService as any).currentLocation = stationaryLocations[stationaryLocations.length - 1];

      const motionState = locationService.detectMotionState();
      expect(motionState).toBe(MotionState.STATIONARY);
    });

    it('should detect walking state for slow movement', () => {
      const baseTime = Date.now();
      // Create locations that represent walking speed (~3 km/h)
      const walkingLocations = [
        { latitude: 37.7749, longitude: -122.4194, timestamp: new Date(baseTime) },
        { latitude: 37.77491, longitude: -122.4194, timestamp: new Date(baseTime + 1000) },
        { latitude: 37.77492, longitude: -122.4194, timestamp: new Date(baseTime + 2000) },
      ];

      (locationService as any).locationHistory = walkingLocations;
      (locationService as any).currentLocation = walkingLocations[walkingLocations.length - 1];

      const motionState = locationService.detectMotionState();
      expect(motionState).toBe(MotionState.WALKING);
    });

    it('should detect running state for fast movement', () => {
      const baseTime = Date.now();
      // Create locations that represent running speed (~10 km/h)
      const runningLocations = [
        { latitude: 37.7749, longitude: -122.4194, timestamp: new Date(baseTime) },
        { latitude: 37.7751, longitude: -122.4194, timestamp: new Date(baseTime + 1000) },
        { latitude: 37.7753, longitude: -122.4194, timestamp: new Date(baseTime + 2000) },
      ];

      (locationService as any).locationHistory = runningLocations;
      (locationService as any).currentLocation = runningLocations[runningLocations.length - 1];

      const motionState = locationService.detectMotionState();
      expect(motionState).toBe(MotionState.RUNNING);
    });
  });

  describe('Pace Calculations', () => {
    it('should calculate current pace based on recent location data', () => {
      const baseTime = Date.now();
      const locations = [
        { latitude: 37.7749, longitude: -122.4194, timestamp: new Date(baseTime) },
        { latitude: 37.7759, longitude: -122.4194, timestamp: new Date(baseTime + 60000) }, // 1 minute later
      ];

      (locationService as any).locationHistory = locations;

      const pace = locationService.calculateCurrentPace(120); // 2 minute window
      
      // Should return a reasonable pace value (minutes per km)
      expect(pace).toBeGreaterThan(0);
      expect(pace).toBeLessThan(30); // Less than 30 min/km (very slow walking)
    });

    it('should calculate average pace for entire session', () => {
      const baseTime = Date.now();
      const locations = [
        { latitude: 37.7749, longitude: -122.4194, timestamp: new Date(baseTime) },
        { latitude: 37.7759, longitude: -122.4194, timestamp: new Date(baseTime + 60000) }, // 1 minute later
        { latitude: 37.7769, longitude: -122.4194, timestamp: new Date(baseTime + 120000) }, // 2 minutes later
      ];

      (locationService as any).locationHistory = locations;

      const averagePace = locationService.calculateAveragePace();
      
      expect(averagePace).toBeGreaterThan(0);
      expect(averagePace).toBeLessThan(30);
    });

    it('should provide smoothed pace using rolling average', () => {
      const baseTime = Date.now();
      const locations = [];
      
      // Create a series of locations with realistic running movement
      // Approximately 6 min/km pace (10 km/h)
      for (let i = 0; i < 15; i++) {
        locations.push({
          latitude: 37.7749 + (i * 0.0009), // ~100m per point
          longitude: -122.4194,
          timestamp: new Date(baseTime + (i * 36000)), // 36 seconds per point for 6 min/km pace
        });
      }

      (locationService as any).locationHistory = locations;

      const smoothedPace = locationService.getSmoothedPace(10);
      
      // Should return a pace between 2 and 20 min/km
      expect(smoothedPace).toBeGreaterThan(2);
      expect(smoothedPace).toBeLessThan(20);
    });

    it('should return 0 pace for insufficient data', () => {
      const locations = [
        { latitude: 37.7749, longitude: -122.4194, timestamp: new Date() },
      ];

      (locationService as any).locationHistory = locations;

      const pace = locationService.calculateCurrentPace();
      expect(pace).toBe(0);
    });
  });

  describe('Auto-Pause/Resume Logic', () => {
    beforeEach(() => {
      // Set shorter thresholds for testing
      locationService.setAutoPauseSettings(1, 2, 1000); // 1 second delay
    });

    it('should trigger auto-pause callback after stationary threshold', () => {
      const autoPauseCallback = jest.fn();
      locationService.onAutoPause = autoPauseCallback;

      // Simulate being stationary for the threshold time
      const baseTime = Date.now();
      const motionStateHistory = [
        { state: MotionState.STATIONARY, timestamp: new Date(baseTime - 2000) },
        { state: MotionState.STATIONARY, timestamp: new Date(baseTime - 1000) },
        { state: MotionState.STATIONARY, timestamp: new Date(baseTime) },
      ];

      (locationService as any).motionStateHistory = motionStateHistory;

      // Trigger evaluation
      (locationService as any).evaluateAutoPauseResume(MotionState.STATIONARY, new Date(baseTime));

      expect(autoPauseCallback).toHaveBeenCalled();
    });

    it('should trigger auto-resume callback after moving threshold', () => {
      const autoResumeCallback = jest.fn();
      locationService.onAutoResume = autoResumeCallback;

      // Simulate moving for the threshold time
      const baseTime = Date.now();
      const motionStateHistory = [
        { state: MotionState.RUNNING, timestamp: new Date(baseTime - 6000) },
        { state: MotionState.RUNNING, timestamp: new Date(baseTime - 3000) },
        { state: MotionState.RUNNING, timestamp: new Date(baseTime) },
      ];

      (locationService as any).motionStateHistory = motionStateHistory;

      // Trigger evaluation
      (locationService as any).evaluateAutoPauseResume(MotionState.RUNNING, new Date(baseTime));

      expect(autoResumeCallback).toHaveBeenCalled();
    });

    it('should calculate consecutive state duration correctly', () => {
      const baseTime = Date.now();
      const motionStateHistory = [
        { state: MotionState.RUNNING, timestamp: new Date(baseTime - 5000) },
        { state: MotionState.STATIONARY, timestamp: new Date(baseTime - 3000) },
        { state: MotionState.STATIONARY, timestamp: new Date(baseTime - 1000) },
      ];

      (locationService as any).motionStateHistory = motionStateHistory;

      const duration = (locationService as any).getConsecutiveStateDuration(
        MotionState.STATIONARY, 
        new Date(baseTime)
      );

      // Should be approximately 3000ms (3 seconds)
      expect(duration).toBeGreaterThan(2900);
      expect(duration).toBeLessThan(3100);
    });
  });

  describe('Utility Methods', () => {
    it('should get total distance traveled', () => {
      const locations = [
        { latitude: 37.7749, longitude: -122.4194, timestamp: new Date() },
        { latitude: 37.7759, longitude: -122.4194, timestamp: new Date() },
        { latitude: 37.7769, longitude: -122.4194, timestamp: new Date() },
      ];

      (locationService as any).locationHistory = locations;

      const totalDistance = locationService.getTotalDistance();
      expect(totalDistance).toBeGreaterThan(200);
      expect(totalDistance).toBeLessThan(250);
    });

    it('should get total elapsed time', () => {
      const baseTime = Date.now();
      const locations = [
        { latitude: 37.7749, longitude: -122.4194, timestamp: new Date(baseTime) },
        { latitude: 37.7759, longitude: -122.4194, timestamp: new Date(baseTime + 60000) },
      ];

      (locationService as any).locationHistory = locations;

      const totalTime = locationService.getTotalTime();
      expect(totalTime).toBe(60); // 60 seconds
    });

    it('should clear location history', () => {
      const locations = [
        { latitude: 37.7749, longitude: -122.4194, timestamp: new Date() },
        { latitude: 37.7759, longitude: -122.4194, timestamp: new Date() },
      ];

      (locationService as any).locationHistory = locations;
      (locationService as any).activeRunId = 123;

      locationService.clearLocationHistory();

      expect((locationService as any).locationHistory).toHaveLength(0);
      expect((locationService as any).currentLocation).toBeNull();
      expect((locationService as any).activeRunId).toBeNull();
    });
  });

  describe('Background Tracking State', () => {
    it('should report background tracking status', () => {
      expect(locationService.isBackgroundTrackingActive()).toBe(false);
      
      // Simulate background tracking being active
      (locationService as any).isBackgroundTracking = true;
      
      expect(locationService.isBackgroundTrackingActive()).toBe(true);
    });

    it('should allow setting auto-pause settings', () => {
      locationService.setAutoPauseSettings(2, 3, 5000);
      
      expect((locationService as any).autoPauseThreshold).toBe(2);
      expect((locationService as any).autoResumeThreshold).toBe(3);
      expect((locationService as any).autoPauseDelay).toBe(5000);
    });
  });
});