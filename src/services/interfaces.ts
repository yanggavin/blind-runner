// Service interfaces - will be implemented in subsequent tasks

export interface RunTrackingService {
  startRun(): Promise<void>;
  pauseRun(): Promise<void>;
  resumeRun(): Promise<void>;
  stopRun(): Promise<RunData>;
  getCurrentMetrics(): RunMetrics;
  isRunning(): boolean;
  isPaused(): boolean;
  setAutoPauseEnabled(enabled: boolean): void;
  restoreActiveRun(): Promise<boolean>;
}

export interface LocationService {
  startTracking(): Promise<void>;
  stopTracking(): Promise<void>;
  getCurrentLocation(): Promise<Location>;
  getLocationHistory(): Location[];
  calculateDistance(points: Location[]): number;
  detectMotionState(): MotionState;
}

export interface TTSService {
  speak(text: string, priority?: Priority): Promise<void>;
  announceMetrics(metrics: RunMetrics): Promise<void>;
  announceRunStart(): Promise<void>;
  announceRunPause(): Promise<void>;
  announceRunResume(): Promise<void>;
  announceRunComplete(summary: RunSummary): Promise<void>;
  setVoiceSettings(settings: VoiceSettings): void;
  startPeriodicAnnouncements(getMetrics: () => RunMetrics): void;
  stopPeriodicAnnouncements(): void;
  resetAnnouncementTracking(): void;
}

export interface HapticService {
  vibrate(pattern: VibrationPattern): Promise<void>;
  kilometerMilestone(): Promise<void>;
  halfKilometerMilestone(): Promise<void>;
  timeMilestone(minutes: number): Promise<void>;
  runStartConfirmation(): Promise<void>;
  runPauseConfirmation(): Promise<void>;
  runResumeConfirmation(): Promise<void>;
  runStopConfirmation(): Promise<void>;
  buttonPress(): Promise<void>;
  errorFeedback(): Promise<void>;
  successFeedback(): Promise<void>;
  warningFeedback(): Promise<void>;
  setEnabled(enabled: boolean): void;
  getEnabled(): boolean;
  setDistanceBasedEnabled(enabled: boolean): void;
  getDistanceBasedEnabled(): boolean;
  setTimeBasedEnabled(enabled: boolean): void;
  getTimeBasedEnabled(): boolean;
  isHapticAvailable(): boolean;
  recheckHapticAvailability(): Promise<boolean>;
}

export interface SOSService {
  activateSOS(): Promise<void>;
  configureSOS(contacts: EmergencyContact[]): Promise<void>;
  testSOS(): Promise<void>;
  isSOSConfigured(): Promise<boolean>;
  getEmergencyContacts(): Promise<EmergencyContact[]>;
  addEmergencyContact(contact: Omit<EmergencyContact, 'id' | 'createdAt'>): Promise<EmergencyContact>;
  updateEmergencyContact(id: number, contact: Partial<EmergencyContact>): Promise<void>;
  deleteEmergencyContact(id: number): Promise<void>;
}

export interface PerformanceService {
  getCurrentMetrics(): PerformanceMetrics;
  getAppStateInfo(): AppStateInfo;
  getPowerSavingSettings(): PowerSavingSettings;
  updatePowerSavingSettings(settings: Partial<PowerSavingSettings>): void;
  enablePowerSavingMode(): void;
  disablePowerSavingMode(): void;
  getOptimalGpsUpdateInterval(): number;
  calculateBatteryUsageRate(): number;
  onBatteryLow(callback: (level: number) => void): void;
  onPowerSavingModeChange(callback: (enabled: boolean) => void): void;
  onAppStateChange(callback: (state: string) => void): void;
}

export interface BackgroundTaskManagerService {
  getBackgroundTaskInfo(): Promise<BackgroundTaskInfo[]>;
  forceAppStateRestore(): Promise<boolean>;
  clearAppState(): void;
  getAppStateData(): AppStateData | null;
  addForegroundRestoreCallback(callback: () => void): void;
  removeForegroundRestoreCallback(callback: () => void): void;
  isAppKilledRecoveryNeeded(): Promise<boolean>;
  performAppKilledRecovery(): Promise<boolean>;
}

// Types - will be fully defined in subsequent tasks
export interface RunData {
  id: number;
  startTime: Date;
  endTime?: Date;
  totalDistance: number;
  totalDuration: number;
  averagePace: number;
  status: 'active' | 'paused' | 'completed';
}

export interface RunMetrics {
  distance: number;
  duration: number;
  currentPace: number;
  averagePace: number;
  splits: Split[];
}

export interface Location {
  latitude: number;
  longitude: number;
  altitude?: number;
  accuracy?: number;
  speed?: number;
  timestamp: Date;
}

export interface Split {
  id: number;
  runId: number;
  splitNumber: number;
  distance: number;
  duration: number;
  pace: number;
  timestamp: Date;
}

export interface EmergencyContact {
  id: number;
  name: string;
  phoneNumber: string;
  isPrimary: boolean;
}

export interface VoiceSettings {
  rate: number;
  pitch: number;
}

export interface RunSummary {
  totalDistance: number;
  totalDuration: number;
  averagePace: number;
  splits: Split[];
}

export enum MotionState {
  STATIONARY = 'stationary',
  WALKING = 'walking',
  RUNNING = 'running'
}

export enum Priority {
  LOW = 'low',
  NORMAL = 'normal',
  HIGH = 'high'
}

export enum VibrationPattern {
  KILOMETER = 'kilometer',
  HALF_KILOMETER = 'half_kilometer',
  TIME_MILESTONE = 'time_milestone',
  START_CONFIRMATION = 'start_confirmation',
  PAUSE_CONFIRMATION = 'pause_confirmation',
  RESUME_CONFIRMATION = 'resume_confirmation',
  STOP_CONFIRMATION = 'stop_confirmation',
  BUTTON_PRESS = 'button_press',
  ERROR = 'error',
  SUCCESS = 'success',
  WARNING = 'warning'
}

export interface PerformanceMetrics {
  batteryLevel: number;
  batteryState: string;
  isLowPowerMode: boolean;
  memoryUsage?: number;
  gpsUpdateFrequency: number;
  backgroundTasksActive: number;
}

export interface PowerSavingSettings {
  gpsUpdateInterval: number;
  backgroundSyncEnabled: boolean;
  hapticFeedbackEnabled: boolean;
  ttsAnnouncementFrequency: number;
  screenBrightness?: number;
}

export interface AppStateInfo {
  currentState: string;
  backgroundTime: number;
  foregroundTime: number;
  lastStateChange: Date;
}

export interface AppStateData {
  activeRunId: number | null;
  runStartTime: Date | null;
  isPaused: boolean;
  lastSaveTime: Date;
  appVersion: string;
}

export interface BackgroundTaskInfo {
  taskName: string;
  isRegistered: boolean;
  lastExecution: Date | null;
  executionCount: number;
  status: 'active' | 'inactive' | 'error';
}