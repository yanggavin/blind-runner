import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import { MMKV } from 'react-native-mmkv';
import { DatabaseService } from '../database';

const BACKGROUND_LOCATION_TASK = 'background-location';
const storage = new MMKV();

interface LocationTaskData {
  locations: Location.LocationObject[];
}

// Define the background task
TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
  if (error) {
    console.error('Background location task error:', error);
    return;
  }

  if (data) {
    const { locations } = data as LocationTaskData;
    
    try {
      // Get the active run ID from storage
      const activeRunId = getActiveRunId();
      
      if (!activeRunId) {
        console.warn('No active run ID found, skipping background location update');
        return;
      }

      // Get the database instance
      const db = await DatabaseService.getInstance();
      
      // Process each location update
      for (const location of locations) {
        // Store location data in database
        await db.addTrackPoint({
          runId: activeRunId,
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          altitude: location.coords.altitude || undefined,
          accuracy: location.coords.accuracy || undefined,
          speed: location.coords.speed || undefined,
          timestamp: new Date(location.timestamp),
        });
      }
    } catch (err) {
      console.error('Error processing background location:', err);
    }
  }
});

// Helper function to get active run ID from storage
function getActiveRunId(): number | null {
  const runId = storage.getNumber('activeRunId');
  return runId || null;
}

// Helper function to set active run ID in storage
export function setActiveRunId(runId: number | null): void {
  if (runId === null) {
    storage.delete('activeRunId');
  } else {
    storage.set('activeRunId', runId);
  }
}

export { BACKGROUND_LOCATION_TASK };