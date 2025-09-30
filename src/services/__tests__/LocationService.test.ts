import { LocationServiceImpl } from '../LocationService';
import { Location, MotionState } from '../interfaces';

// Mock expo-location
jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(),
  watchPositionAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  Accuracy: {
    BestForNavigation: 6,
  },
}));

describe('LocationService', () => {
  let locationService: LocationServiceImpl;

  beforeEach(() => {
    locationService = new LocationServiceImpl();
    jest.clearAllMocks();
  });

  describe('haversineDistance calculation', () => {
    it('should calculate distance between two points correctly', () => {
      // Test points: approximately 1km apart
      const point1: Location = {
        latitude: 40.7128,
        longitude: -74.0060,
        timestamp: new Date(),
      };
      
      const point2: Location = {
        latitude: 40.7228,
        longitude: -74.0060,
        timestamp: new Date(),
      };

      const distance = locationService.calculateDistance([point1, point2]);
      
      // Should be approximately 1111 meters (1 degree latitude ≈ 111km)
      expect(distance).toBeCloseTo(1111, -2); // Within 100m tolerance
    });

    it('should return 0 for identical points', () => {
      const point: Location = {
        latitude: 40.7128,
        longitude: -74.0060,
        timestamp: new Date(),
      };

      const distance = locationService.calculateDistance([point, point]);
      expect(distance).toBe(0);
    });

    it('should return 0 for single point', () => {
      const point: Location = {
        latitude: 40.7128,
        longitude: -74.0060,
        timestamp: new Date(),
      };

      const distance = locationService.calculateDistance([point]);
      expect(distance).toBe(0);
    });

    it('should return 0 for empty array', () => {
      const distance = locationService.calculateDistance([]);
      expect(distance).toBe(0);
    });

    it('should calculate cumulative distance for multiple points', () => {
      const points: Location[] = [
        { latitude: 0, longitude: 0, timestamp: new Date() },
        { latitude: 0.001, longitude: 0, timestamp: new Date() }, // ~111m north
        { latitude: 0.001, longitude: 0.001, timestamp: new Date() }, // ~111m east
        { latitude: 0, longitude: 0.001, timestamp: new Date() }, // ~111m south
      ];

      const distance = locationService.calculateDistance(points);
      
      // Should be approximately 333 meters (3 segments of ~111m each)
      expect(distance).toBeCloseTo(333, -1); // Within 10m tolerance
    });
  });

  describe('motion detection', () => {
    beforeEach(() => {
      locationService.clearLocationHistory();
    });

    it('should return STATIONARY when no location data', () => {
      const motionState = locationService.detectMotionState();
      expect(motionState).toBe(MotionState.STATIONARY);
    });

    it('should return STATIONARY for very slow movement', () => {
      const now = new Date();
      const locations: Location[] = [
        {
          latitude: 40.7128,
          longitude: -74.0060,
          timestamp: new Date(now.getTime() - 10000), // 10 seconds ago
        },
        {
          latitude: 40.7128001, // Very small movement
          longitude: -74.0060,
          timestamp: now,
        },
      ];

      // Manually add locations to history for testing
      locations.forEach(loc => {
        (locationService as any).locationHistory.push(loc);
        (locationService as any).currentLocation = loc;
      });

      const motionState = locationService.detectMotionState();
      expect(motionState).toBe(MotionState.STATIONARY);
    });

    it('should return WALKING for moderate speed', () => {
      const now = new Date();
      const locations: Location[] = [
        {
          latitude: 40.7128,
          longitude: -74.0060,
          timestamp: new Date(now.getTime() - 10000), // 10 seconds ago
        },
        {
          latitude: 40.7130, // ~222m movement in 10 seconds = ~80 km/h (too fast, but testing the threshold)
          longitude: -74.0060,
          timestamp: now,
        },
      ];

      // Create more realistic walking speed: ~5 km/h
      const walkingLocations: Location[] = [
        {
          latitude: 40.7128,
          longitude: -74.0060,
          timestamp: new Date(now.getTime() - 10000),
        },
        {
          latitude: 40.71294, // ~155m in 10 seconds = ~56 km/h (still too fast for walking)
          longitude: -74.0060,
          timestamp: now,
        },
      ];

      // Let's use a more realistic scenario: 14m in 10 seconds = 5 km/h
      const realisticWalkingLocations: Location[] = [
        {
          latitude: 40.7128,
          longitude: -74.0060,
          timestamp: new Date(now.getTime() - 10000),
        },
        {
          latitude: 40.712926, // ~14m movement
          longitude: -74.0060,
          timestamp: now,
        },
      ];

      realisticWalkingLocations.forEach(loc => {
        (locationService as any).locationHistory.push(loc);
        (locationService as any).currentLocation = loc;
      });

      const motionState = locationService.detectMotionState();
      expect(motionState).toBe(MotionState.WALKING);
    });
  });

  describe('location history management', () => {
    it('should return empty array initially', () => {
      const history = locationService.getLocationHistory();
      expect(history).toEqual([]);
    });

    it('should clear location history', () => {
      // Add some mock data
      (locationService as any).locationHistory = [
        { latitude: 40.7128, longitude: -74.0060, timestamp: new Date() },
      ];
      (locationService as any).currentLocation = { latitude: 40.7128, longitude: -74.0060, timestamp: new Date() };

      locationService.clearLocationHistory();

      expect(locationService.getLocationHistory()).toEqual([]);
      expect((locationService as any).currentLocation).toBeNull();
    });
  });
});