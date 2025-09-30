import { RunTrackingServiceImpl } from '../RunTrackingService';
import { LocationService, Location, MotionState } from '../interfaces';
import { DatabaseService } from '../../database/DatabaseService';

// Mock location service
const mockLocationService: jest.Mocked<LocationService> = {
  startTracking: jest.fn(),
  stopTracking: jest.fn(),
  getCurrentLocation: jest.fn(),
  getLocationHistory: jest.fn(),
  calculateDistance: jest.fn(),
  detectMotionState: jest.fn(),
};

// Mock database service
const mockDatabaseService = {
  createRun: jest.fn(),
  updateRun: jest.fn(),
  getRun: jest.fn(),
  getActiveRun: jest.fn(),
  addTrackPoint: jest.fn(),
  addSplit: jest.fn(),
  getInstance: jest.fn(),
};

// Mock DatabaseService.getInstance
jest.mock('../../database/DatabaseService', () => ({
  DatabaseService: {
    getInstance: jest.fn(() => Promise.resolve(mockDatabaseService)),
  },
}));

describe('RunTrackingService', () => {
  let runTrackingService: RunTrackingServiceImpl;

  beforeEach(() => {
    runTrackingService = new RunTrackingServiceImpl(mockLocationService);
    jest.clearAllMocks();
    jest.useFakeTimers();
    
    // Setup default mock returns
    mockDatabaseService.createRun.mockResolvedValue(1);
    mockDatabaseService.updateRun.mockResolvedValue(undefined);
    mockDatabaseService.addTrackPoint.mockResolvedValue(1);
    mockDatabaseService.addSplit.mockResolvedValue(1);
    mockLocationService.getCurrentLocation.mockResolvedValue({
      latitude: 0,
      longitude: 0,
      timestamp: new Date(),
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('run lifecycle', () => {
    it('should start a run successfully', async () => {
      mockLocationService.startTracking.mockResolvedValue();
      
      await runTrackingService.startRun();
      
      expect(runTrackingService.isRunning()).toBe(true);
      expect(runTrackingService.isPaused()).toBe(false);
      expect(mockLocationService.startTracking).toHaveBeenCalled();
    });

    it('should not allow starting multiple runs', async () => {
      mockLocationService.startTracking.mockResolvedValue();
      
      await runTrackingService.startRun();
      
      await expect(runTrackingService.startRun()).rejects.toThrow('Run is already active');
    });

    it('should pause an active run', async () => {
      mockLocationService.startTracking.mockResolvedValue();
      mockLocationService.stopTracking.mockResolvedValue();
      
      await runTrackingService.startRun();
      await runTrackingService.pauseRun();
      
      expect(runTrackingService.isRunning()).toBe(true);
      expect(runTrackingService.isPaused()).toBe(true);
      expect(mockLocationService.stopTracking).toHaveBeenCalled();
    });

    it('should not allow pausing when no run is active', async () => {
      await expect(runTrackingService.pauseRun()).rejects.toThrow('No active run to pause');
    });

    it('should resume a paused run', async () => {
      mockLocationService.startTracking.mockResolvedValue();
      mockLocationService.stopTracking.mockResolvedValue();
      
      await runTrackingService.startRun();
      await runTrackingService.pauseRun();
      
      jest.advanceTimersByTime(5000); // 5 seconds pause
      
      await runTrackingService.resumeRun();
      
      expect(runTrackingService.isRunning()).toBe(true);
      expect(runTrackingService.isPaused()).toBe(false);
      expect(mockLocationService.startTracking).toHaveBeenCalledTimes(2);
    });

    it('should not allow resuming when not paused', async () => {
      mockLocationService.startTracking.mockResolvedValue();
      
      await runTrackingService.startRun();
      
      await expect(runTrackingService.resumeRun()).rejects.toThrow('No paused run to resume');
    });

    it('should stop a run and return run data', async () => {
      mockLocationService.startTracking.mockResolvedValue();
      mockLocationService.stopTracking.mockResolvedValue();
      mockLocationService.getLocationHistory.mockReturnValue([]);
      mockLocationService.calculateDistance.mockReturnValue(0);
      
      await runTrackingService.startRun();
      
      jest.advanceTimersByTime(60000); // 1 minute
      
      const runData = await runTrackingService.stopRun();
      
      expect(runData).toBeDefined();
      expect(runData.status).toBe('completed');
      expect(runData.endTime).toBeDefined();
      expect(runTrackingService.isRunning()).toBe(false);
      expect(mockLocationService.stopTracking).toHaveBeenCalled();
    });

    it('should not allow stopping when no run is active', async () => {
      await expect(runTrackingService.stopRun()).rejects.toThrow('No active run to stop');
    });
  });

  describe('metrics calculation', () => {
    beforeEach(async () => {
      mockLocationService.startTracking.mockResolvedValue();
      await runTrackingService.startRun();
    });

    it('should return current metrics during a run', () => {
      const mockLocations: Location[] = [
        { latitude: 0, longitude: 0, timestamp: new Date(Date.now() - 60000) },
        { latitude: 0.001, longitude: 0, timestamp: new Date() },
      ];
      
      mockLocationService.getLocationHistory.mockReturnValue(mockLocations);
      mockLocationService.calculateDistance.mockReturnValue(111); // ~111 meters
      
      jest.advanceTimersByTime(60000); // 1 minute
      
      const metrics = runTrackingService.getCurrentMetrics();
      
      expect(metrics.distance).toBe(111);
      expect(metrics.duration).toBe(60);
      expect(metrics.averagePace).toBeCloseTo(9.01, 1); // ~9 minutes per km
    });

    it('should return zero metrics when no run is active', () => {
      const service = new RunTrackingServiceImpl(mockLocationService);
      const metrics = service.getCurrentMetrics();
      
      expect(metrics.distance).toBe(0);
      expect(metrics.duration).toBe(0);
      expect(metrics.currentPace).toBe(0);
      expect(metrics.averagePace).toBe(0);
      expect(metrics.splits).toEqual([]);
    });

    it('should calculate splits correctly', () => {
      const mockLocations: Location[] = [];
      const now = new Date();
      
      // Create locations for 2.5km run with more realistic spacing
      for (let i = 0; i <= 25; i++) {
        mockLocations.push({
          latitude: i * 0.001, // Each step is ~111m
          longitude: 0,
          timestamp: new Date(now.getTime() + i * 24000), // 24 seconds per 111m
        });
      }
      
      mockLocationService.getLocationHistory.mockReturnValue(mockLocations);
      
      // Mock calculateDistance to return cumulative distances for split calculation
      let callCount = 0;
      mockLocationService.calculateDistance.mockImplementation((points) => {
        callCount++;
        if (points.length === 2) {
          // Individual segment distance
          return 111; // ~111m per segment
        }
        // For split calculations, return appropriate distances
        return points.length * 111;
      });
      
      const metrics = runTrackingService.getCurrentMetrics();
      
      // With 26 points (25 segments of 111m each = 2775m), should have 2 complete km splits
      expect(metrics.splits.length).toBe(2);
    });
  });

  describe('auto-pause functionality', () => {
    beforeEach(async () => {
      mockLocationService.startTracking.mockResolvedValue();
      mockLocationService.stopTracking.mockResolvedValue();
      runTrackingService = new RunTrackingServiceImpl(mockLocationService);
    });

    it('should have auto-pause enabled by default', () => {
      // Test that auto-pause is enabled by default
      expect((runTrackingService as any).autoPauseEnabled).toBe(true);
    });

    it('should allow disabling auto-pause', () => {
      runTrackingService.setAutoPauseEnabled(false);
      expect((runTrackingService as any).autoPauseEnabled).toBe(false);
    });

    it('should allow enabling auto-pause', () => {
      runTrackingService.setAutoPauseEnabled(false);
      runTrackingService.setAutoPauseEnabled(true);
      expect((runTrackingService as any).autoPauseEnabled).toBe(true);
    });
  });

  describe('duration calculation with pauses', () => {
    beforeEach(async () => {
      mockLocationService.startTracking.mockResolvedValue();
      mockLocationService.stopTracking.mockResolvedValue();
      mockLocationService.getLocationHistory.mockReturnValue([]);
      mockLocationService.calculateDistance.mockReturnValue(0);
      
      // Ensure we have a fresh service instance for each test
      runTrackingService = new RunTrackingServiceImpl(mockLocationService);
    });

    it('should exclude paused time from total duration', async () => {
      await runTrackingService.startRun();
      
      // Run for 30 seconds
      jest.advanceTimersByTime(30000);
      
      await runTrackingService.pauseRun();
      
      // Pause for 60 seconds
      jest.advanceTimersByTime(60000);
      
      await runTrackingService.resumeRun();
      
      // Run for another 30 seconds
      jest.advanceTimersByTime(30000);
      
      const metrics = runTrackingService.getCurrentMetrics();
      
      // Total active time should be 60 seconds (30 + 30), not 120
      expect(metrics.duration).toBe(60);
    });

    it('should handle multiple pause/resume cycles', async () => {
      await runTrackingService.startRun();
      
      // Run 10s, pause 5s, run 10s, pause 5s, run 10s
      jest.advanceTimersByTime(10000);
      await runTrackingService.pauseRun();
      
      jest.advanceTimersByTime(5000);
      await runTrackingService.resumeRun();
      
      jest.advanceTimersByTime(10000);
      await runTrackingService.pauseRun();
      
      jest.advanceTimersByTime(5000);
      await runTrackingService.resumeRun();
      
      jest.advanceTimersByTime(10000);
      
      const metrics = runTrackingService.getCurrentMetrics();
      
      // Total active time should be 30 seconds
      expect(metrics.duration).toBe(30);
    });

    it('should include final pause time when stopping while paused', async () => {
      await runTrackingService.startRun();
      
      jest.advanceTimersByTime(30000); // Run for 30 seconds
      await runTrackingService.pauseRun();
      
      jest.advanceTimersByTime(10000); // Pause for 10 seconds
      
      const runData = await runTrackingService.stopRun();
      
      // Should only count the 30 seconds of active running
      expect(runData.totalDuration).toBe(30);
    });
  });

  describe('database integration', () => {
    beforeEach(async () => {
      mockLocationService.startTracking.mockResolvedValue();
      mockLocationService.stopTracking.mockResolvedValue();
      mockLocationService.getLocationHistory.mockReturnValue([]);
      mockLocationService.calculateDistance.mockReturnValue(0);
    });

    it('should create run in database when starting', async () => {
      await runTrackingService.startRun();
      
      expect(mockDatabaseService.createRun).toHaveBeenCalledWith(expect.any(Date));
    });

    it('should update run status in database when pausing', async () => {
      await runTrackingService.startRun();
      await runTrackingService.pauseRun();
      
      expect(mockDatabaseService.updateRun).toHaveBeenCalledWith(1, {
        status: 'paused'
      });
    });

    it('should update run status in database when resuming', async () => {
      await runTrackingService.startRun();
      await runTrackingService.pauseRun();
      await runTrackingService.resumeRun();
      
      expect(mockDatabaseService.updateRun).toHaveBeenCalledWith(1, {
        status: 'active'
      });
    });

    it('should save final run data when stopping', async () => {
      await runTrackingService.startRun();
      
      jest.advanceTimersByTime(60000); // 1 minute
      
      await runTrackingService.stopRun();
      
      expect(mockDatabaseService.updateRun).toHaveBeenCalledWith(1, {
        endTime: expect.any(Date),
        totalDistance: 0,
        totalDuration: 60,
        averagePace: 0,
        status: 'completed'
      });
    });

    it('should save track points periodically', async () => {
      await runTrackingService.startRun();
      
      // Advance time to trigger track point saving and wait for async operations
      jest.advanceTimersByTime(10000); // 10 seconds
      await Promise.resolve(); // Allow async operations to complete
      
      expect(mockDatabaseService.addTrackPoint).toHaveBeenCalledWith({
        runId: 1,
        latitude: 0,
        longitude: 0,
        altitude: undefined,
        accuracy: undefined,
        speed: undefined,
        timestamp: expect.any(Date)
      });
    });

    it('should handle database errors gracefully', async () => {
      mockDatabaseService.createRun.mockRejectedValue(new Error('Database error'));
      
      // Should not throw error, but log it
      await expect(runTrackingService.startRun()).resolves.not.toThrow();
      expect(runTrackingService.isRunning()).toBe(true);
    });
  });

  describe('run restoration', () => {
    it('should restore active run from database', async () => {
      const mockActiveRun = {
        id: 1,
        startTime: new Date(Date.now() - 60000), // 1 minute ago
        totalDistance: 500,
        totalDuration: 60,
        averagePace: 6,
        status: 'active' as const,
        splits: [],
        trackPoints: [],
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockDatabaseService.getActiveRun.mockResolvedValue(mockActiveRun);
      mockLocationService.startTracking.mockResolvedValue();

      const restored = await runTrackingService.restoreActiveRun();

      expect(restored).toBe(true);
      expect(runTrackingService.isRunning()).toBe(true);
      expect(runTrackingService.isPaused()).toBe(false);
      expect(mockLocationService.startTracking).toHaveBeenCalled();
    });

    it('should restore paused run from database', async () => {
      const mockPausedRun = {
        id: 1,
        startTime: new Date(Date.now() - 60000),
        totalDistance: 500,
        totalDuration: 60,
        averagePace: 6,
        status: 'paused' as const,
        splits: [],
        trackPoints: [],
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockDatabaseService.getActiveRun.mockResolvedValue(mockPausedRun);

      const restored = await runTrackingService.restoreActiveRun();

      expect(restored).toBe(true);
      expect(runTrackingService.isRunning()).toBe(true);
      expect(runTrackingService.isPaused()).toBe(true);
      expect(mockLocationService.startTracking).not.toHaveBeenCalled();
    });

    it('should return false when no active run exists', async () => {
      mockDatabaseService.getActiveRun.mockResolvedValue(null);

      const restored = await runTrackingService.restoreActiveRun();

      expect(restored).toBe(false);
      expect(runTrackingService.isRunning()).toBe(false);
    });

    it('should not restore when already running', async () => {
      await runTrackingService.startRun();

      const restored = await runTrackingService.restoreActiveRun();

      expect(restored).toBe(false);
    });
  });

  describe('auto-pause configuration', () => {
    it('should allow enabling and disabling auto-pause', () => {
      runTrackingService.setAutoPauseEnabled(false);
      expect((runTrackingService as any).autoPauseEnabled).toBe(false);

      runTrackingService.setAutoPauseEnabled(true);
      expect((runTrackingService as any).autoPauseEnabled).toBe(true);
    });

    it('should start auto-detection interval when enabling during active run', async () => {
      runTrackingService.setAutoPauseEnabled(false);
      await runTrackingService.startRun();

      // Clear the interval that was not started
      const intervalsBefore = (runTrackingService as any).autoDetectionInterval;
      expect(intervalsBefore).toBeNull();

      runTrackingService.setAutoPauseEnabled(true);

      const intervalsAfter = (runTrackingService as any).autoDetectionInterval;
      expect(intervalsAfter).not.toBeNull();
    });

    it('should stop auto-detection interval when disabling during active run', async () => {
      await runTrackingService.startRun();

      const intervalsBefore = (runTrackingService as any).autoDetectionInterval;
      expect(intervalsBefore).not.toBeNull();

      runTrackingService.setAutoPauseEnabled(false);

      const intervalsAfter = (runTrackingService as any).autoDetectionInterval;
      expect(intervalsAfter).toBeNull();
    });
  });
});