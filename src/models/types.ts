// TypeScript interfaces for data models

export type RunStatus = 'active' | 'paused' | 'completed';

export interface RunData {
  id: number;
  startTime: Date;
  endTime?: Date;
  totalDistance: number; // in meters
  totalDuration: number; // in seconds
  averagePace: number; // in minutes per kilometer
  status: RunStatus;
  splits: Split[];
  trackPoints: TrackPoint[];
  createdAt: Date;
  updatedAt: Date;
}

export interface Split {
  id: number;
  runId: number;
  splitNumber: number;
  distance: number; // in meters
  duration: number; // in seconds
  pace: number; // in minutes per kilometer
  timestamp: Date;
}

export interface TrackPoint {
  id: number;
  runId: number;
  latitude: number;
  longitude: number;
  altitude?: number; // in meters
  accuracy?: number; // in meters
  speed?: number; // in meters per second
  timestamp: Date;
}

export interface AppSettings {
  id: number;
  announcementFrequencyMinutes: number;
  announcementFrequencyDistance: number; // in meters
  hapticDistanceEnabled: boolean;
  hapticTimeEnabled: boolean;
  voiceRate: number; // 0.1 to 2.0
  voicePitch: number; // 0.5 to 2.0
  autoPauseEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface EmergencyContact {
  id: number;
  name: string;
  phoneNumber: string;
  isPrimary: boolean;
  createdAt: Date;
}

// Database row interfaces (for raw database operations)
export interface RunDataRow {
  id: number;
  start_time: string;
  end_time?: string;
  total_distance: number;
  total_duration: number;
  average_pace: number;
  status: RunStatus;
  created_at: string;
  updated_at: string;
}

export interface SplitRow {
  id: number;
  run_id: number;
  split_number: number;
  distance: number;
  duration: number;
  pace: number;
  timestamp: string;
}

export interface TrackPointRow {
  id: number;
  run_id: number;
  latitude: number;
  longitude: number;
  altitude?: number;
  accuracy?: number;
  speed?: number;
  timestamp: string;
}

export interface AppSettingsRow {
  id: number;
  announcement_frequency_minutes: number;
  announcement_frequency_distance: number;
  haptic_distance_enabled: number; // SQLite boolean as integer
  haptic_time_enabled: number;
  voice_rate: number;
  voice_pitch: number;
  auto_pause_enabled: number;
  created_at: string;
  updated_at: string;
}

export interface EmergencyContactRow {
  id: number;
  name: string;
  phone_number: string;
  is_primary: number; // SQLite boolean as integer
  created_at: string;
}

// Validation functions
export function validateRunData(data: Partial<RunData>): string[] {
  const errors: string[] = [];
  
  if (data.totalDistance !== undefined && data.totalDistance < 0) {
    errors.push('Total distance cannot be negative');
  }
  
  if (data.totalDuration !== undefined && data.totalDuration < 0) {
    errors.push('Total duration cannot be negative');
  }
  
  if (data.averagePace !== undefined && data.averagePace < 0) {
    errors.push('Average pace cannot be negative');
  }
  
  if (data.status && !['active', 'paused', 'completed'].includes(data.status)) {
    errors.push('Invalid run status');
  }
  
  return errors;
}

export function validateSplit(split: Partial<Split>): string[] {
  const errors: string[] = [];
  
  if (split.splitNumber !== undefined && split.splitNumber <= 0) {
    errors.push('Split number must be positive');
  }
  
  if (split.distance !== undefined && split.distance <= 0) {
    errors.push('Split distance must be positive');
  }
  
  if (split.duration !== undefined && split.duration <= 0) {
    errors.push('Split duration must be positive');
  }
  
  if (split.pace !== undefined && split.pace < 0) {
    errors.push('Split pace cannot be negative');
  }
  
  return errors;
}

export function validateTrackPoint(point: Partial<TrackPoint>): string[] {
  const errors: string[] = [];
  
  if (point.latitude !== undefined && (point.latitude < -90 || point.latitude > 90)) {
    errors.push('Latitude must be between -90 and 90');
  }
  
  if (point.longitude !== undefined && (point.longitude < -180 || point.longitude > 180)) {
    errors.push('Longitude must be between -180 and 180');
  }
  
  if (point.accuracy !== undefined && point.accuracy < 0) {
    errors.push('Accuracy cannot be negative');
  }
  
  if (point.speed !== undefined && point.speed < 0) {
    errors.push('Speed cannot be negative');
  }
  
  return errors;
}

export function validateAppSettings(settings: Partial<AppSettings>): string[] {
  const errors: string[] = [];
  
  if (settings.announcementFrequencyMinutes !== undefined && settings.announcementFrequencyMinutes <= 0) {
    errors.push('Announcement frequency minutes must be positive');
  }
  
  if (settings.announcementFrequencyDistance !== undefined && settings.announcementFrequencyDistance <= 0) {
    errors.push('Announcement frequency distance must be positive');
  }
  
  if (settings.voiceRate !== undefined && (settings.voiceRate < 0.1 || settings.voiceRate > 2.0)) {
    errors.push('Voice rate must be between 0.1 and 2.0');
  }
  
  if (settings.voicePitch !== undefined && (settings.voicePitch < 0.5 || settings.voicePitch > 2.0)) {
    errors.push('Voice pitch must be between 0.5 and 2.0');
  }
  
  return errors;
}

export function validateEmergencyContact(contact: Partial<EmergencyContact>): string[] {
  const errors: string[] = [];
  
  if (contact.name !== undefined && contact.name.trim().length === 0) {
    errors.push('Contact name cannot be empty');
  }
  
  if (contact.phoneNumber !== undefined) {
    // Basic phone number validation (digits, spaces, dashes, parentheses, plus)
    const phoneRegex = /^[\+]?[\d\s\-\(\)]+$/;
    if (!phoneRegex.test(contact.phoneNumber.trim())) {
      errors.push('Invalid phone number format');
    }
  }
  
  return errors;
}

// Utility functions for data conversion
export function convertRowToRunData(row: RunDataRow, splits: Split[] = [], trackPoints: TrackPoint[] = []): RunData {
  return {
    id: row.id,
    startTime: new Date(row.start_time),
    endTime: row.end_time ? new Date(row.end_time) : undefined,
    totalDistance: row.total_distance,
    totalDuration: row.total_duration,
    averagePace: row.average_pace,
    status: row.status,
    splits,
    trackPoints,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at)
  };
}

export function convertRowToSplit(row: SplitRow): Split {
  return {
    id: row.id,
    runId: row.run_id,
    splitNumber: row.split_number,
    distance: row.distance,
    duration: row.duration,
    pace: row.pace,
    timestamp: new Date(row.timestamp)
  };
}

export function convertRowToTrackPoint(row: TrackPointRow): TrackPoint {
  return {
    id: row.id,
    runId: row.run_id,
    latitude: row.latitude,
    longitude: row.longitude,
    altitude: row.altitude,
    accuracy: row.accuracy,
    speed: row.speed,
    timestamp: new Date(row.timestamp)
  };
}

export function convertRowToAppSettings(row: AppSettingsRow): AppSettings {
  return {
    id: row.id,
    announcementFrequencyMinutes: row.announcement_frequency_minutes,
    announcementFrequencyDistance: row.announcement_frequency_distance,
    hapticDistanceEnabled: Boolean(row.haptic_distance_enabled),
    hapticTimeEnabled: Boolean(row.haptic_time_enabled),
    voiceRate: row.voice_rate,
    voicePitch: row.voice_pitch,
    autoPauseEnabled: Boolean(row.auto_pause_enabled),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at)
  };
}

export function convertRowToEmergencyContact(row: EmergencyContactRow): EmergencyContact {
  return {
    id: row.id,
    name: row.name,
    phoneNumber: row.phone_number,
    isPrimary: Boolean(row.is_primary),
    createdAt: new Date(row.created_at)
  };
}