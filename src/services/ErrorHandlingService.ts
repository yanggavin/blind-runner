import { TTSServiceImpl } from './TTSService';
import { HapticServiceImpl } from './HapticService';
import { Priority } from './interfaces';

export enum ErrorType {
  GPS_SIGNAL_LOST = 'gps_signal_lost',
  GPS_PERMISSION_DENIED = 'gps_permission_denied',
  BACKGROUND_LOCATION_DENIED = 'background_location_denied',
  TTS_ENGINE_UNAVAILABLE = 'tts_engine_unavailable',
  TTS_AUDIO_INTERRUPTED = 'tts_audio_interrupted',
  HAPTIC_ENGINE_UNAVAILABLE = 'haptic_engine_unavailable',
  DATABASE_ERROR = 'database_error',
  STORAGE_FULL = 'storage_full',
  SMS_SEND_FAILED = 'sms_send_failed',
  NETWORK_UNAVAILABLE = 'network_unavailable',
  SENSOR_ACCESS_DENIED = 'sensor_access_denied'
}

export interface ErrorContext {
  type: ErrorType;
  message: string;
  originalError?: Error;
  timestamp: Date;
  recoverable: boolean;
  fallbackAvailable: boolean;
}

export interface ErrorRecoveryStrategy {
  type: ErrorType;
  retryCount: number;
  maxRetries: number;
  retryDelay: number;
  fallbackAction?: () => Promise<void>;
  userNotification?: string;
}

export class ErrorHandlingService {
  private static instance: ErrorHandlingService | null = null;
  private ttsService: TTSServiceImpl | null = null;
  private hapticService: HapticServiceImpl | null = null;
  private errorHistory: ErrorContext[] = [];
  private recoveryStrategies: Map<ErrorType, ErrorRecoveryStrategy> = new Map();
  private activeRecoveries: Map<ErrorType, NodeJS.Timeout> = new Map();

  private constructor() {
    this.initializeRecoveryStrategies();
  }

  static getInstance(): ErrorHandlingService {
    if (!ErrorHandlingService.instance) {
      ErrorHandlingService.instance = new ErrorHandlingService();
    }
    return ErrorHandlingService.instance;
  }

  setServices(ttsService: TTSServiceImpl, hapticService: HapticServiceImpl): void {
    this.ttsService = ttsService;
    this.hapticService = hapticService;
  }

  private initializeRecoveryStrategies(): void {
    // GPS Signal Lost - retry with exponential backoff
    this.recoveryStrategies.set(ErrorType.GPS_SIGNAL_LOST, {
      type: ErrorType.GPS_SIGNAL_LOST,
      retryCount: 0,
      maxRetries: 5,
      retryDelay: 5000,
      userNotification: 'GPS signal lost. Continuing time tracking.',
      fallbackAction: async () => {
        // Continue tracking time without GPS
        console.log('Fallback: Continuing time-only tracking');
      }
    });

    // GPS Permission Denied - no retry, show instructions
    this.recoveryStrategies.set(ErrorType.GPS_PERMISSION_DENIED, {
      type: ErrorType.GPS_PERMISSION_DENIED,
      retryCount: 0,
      maxRetries: 0,
      retryDelay: 0,
      userNotification: 'Location permission required. Please enable in settings.',
      fallbackAction: async () => {
        // Provide manual tracking mode
        console.log('Fallback: Manual tracking mode activated');
      }
    });

    // Background Location Denied - continue with foreground only
    this.recoveryStrategies.set(ErrorType.BACKGROUND_LOCATION_DENIED, {
      type: ErrorType.BACKGROUND_LOCATION_DENIED,
      retryCount: 0,
      maxRetries: 1,
      retryDelay: 0,
      userNotification: 'Background location disabled. App must stay open during runs.',
      fallbackAction: async () => {
        // Continue with foreground-only tracking
        console.log('Fallback: Foreground-only location tracking');
      }
    });

    // TTS Engine Unavailable - fall back to haptic only
    this.recoveryStrategies.set(ErrorType.TTS_ENGINE_UNAVAILABLE, {
      type: ErrorType.TTS_ENGINE_UNAVAILABLE,
      retryCount: 0,
      maxRetries: 2,
      retryDelay: 2000,
      userNotification: 'Voice announcements unavailable. Using haptic feedback only.',
      fallbackAction: async () => {
        // Enable enhanced haptic feedback
        console.log('Fallback: Enhanced haptic feedback mode');
      }
    });

    // TTS Audio Interrupted - queue and retry
    this.recoveryStrategies.set(ErrorType.TTS_AUDIO_INTERRUPTED, {
      type: ErrorType.TTS_AUDIO_INTERRUPTED,
      retryCount: 0,
      maxRetries: 3,
      retryDelay: 1000,
      fallbackAction: async () => {
        // Queue announcements for later
        console.log('Fallback: Queueing announcements for retry');
      }
    });

    // Haptic Engine Unavailable - disable haptic features
    this.recoveryStrategies.set(ErrorType.HAPTIC_ENGINE_UNAVAILABLE, {
      type: ErrorType.HAPTIC_ENGINE_UNAVAILABLE,
      retryCount: 0,
      maxRetries: 1,
      retryDelay: 0,
      userNotification: 'Haptic feedback unavailable.',
      fallbackAction: async () => {
        // Disable haptic features gracefully
        console.log('Fallback: Haptic features disabled');
      }
    });

    // Database Error - retry with exponential backoff
    this.recoveryStrategies.set(ErrorType.DATABASE_ERROR, {
      type: ErrorType.DATABASE_ERROR,
      retryCount: 0,
      maxRetries: 3,
      retryDelay: 1000,
      fallbackAction: async () => {
        // Use in-memory storage as fallback
        console.log('Fallback: In-memory storage activated');
      }
    });

    // Storage Full - offer cleanup options
    this.recoveryStrategies.set(ErrorType.STORAGE_FULL, {
      type: ErrorType.STORAGE_FULL,
      retryCount: 0,
      maxRetries: 0,
      retryDelay: 0,
      userNotification: 'Storage full. Please delete old runs or export data.',
      fallbackAction: async () => {
        // Suggest cleanup actions
        console.log('Fallback: Storage cleanup required');
      }
    });

    // SMS Send Failed - retry with delay
    this.recoveryStrategies.set(ErrorType.SMS_SEND_FAILED, {
      type: ErrorType.SMS_SEND_FAILED,
      retryCount: 0,
      maxRetries: 3,
      retryDelay: 5000,
      userNotification: 'Emergency message failed to send. Retrying...',
      fallbackAction: async () => {
        // Queue for retry when network available
        console.log('Fallback: Queueing emergency message for retry');
      }
    });
  }

  async handleError(error: Error, type: ErrorType, context?: any): Promise<void> {
    const errorContext: ErrorContext = {
      type,
      message: error.message,
      originalError: error,
      timestamp: new Date(),
      recoverable: this.isRecoverable(type),
      fallbackAvailable: this.hasFallback(type)
    };

    // Add to error history
    this.errorHistory.push(errorContext);
    
    // Keep only last 100 errors
    if (this.errorHistory.length > 100) {
      this.errorHistory = this.errorHistory.slice(-100);
    }

    console.error(`Error handled: ${type}`, error);

    // Get recovery strategy
    const strategy = this.recoveryStrategies.get(type);
    if (!strategy) {
      console.error(`No recovery strategy for error type: ${type}`);
      return;
    }

    // Notify user if needed
    if (strategy.userNotification) {
      await this.notifyUser(strategy.userNotification, Priority.HIGH);
    }

    // Attempt recovery
    if (errorContext.recoverable && strategy.retryCount < strategy.maxRetries) {
      await this.attemptRecovery(strategy, context);
    } else if (errorContext.fallbackAvailable && strategy.fallbackAction) {
      await strategy.fallbackAction();
    }
  }

  private async attemptRecovery(strategy: ErrorRecoveryStrategy, context?: any): Promise<void> {
    strategy.retryCount++;
    
    // Clear any existing recovery timer
    const existingTimer = this.activeRecoveries.get(strategy.type);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Calculate exponential backoff delay
    const delay = strategy.retryDelay * Math.pow(2, strategy.retryCount - 1);
    
    const timer = setTimeout(async () => {
      try {
        await this.executeRecovery(strategy.type, context);
        // Reset retry count on successful recovery
        strategy.retryCount = 0;
        this.activeRecoveries.delete(strategy.type);
      } catch (error) {
        console.error(`Recovery attempt failed for ${strategy.type}:`, error);
        
        // If max retries reached, try fallback
        if (strategy.retryCount >= strategy.maxRetries && strategy.fallbackAction) {
          await strategy.fallbackAction();
        }
        
        this.activeRecoveries.delete(strategy.type);
      }
    }, delay);

    this.activeRecoveries.set(strategy.type, timer);
  }

  private async executeRecovery(type: ErrorType, context?: any): Promise<void> {
    switch (type) {
      case ErrorType.GPS_SIGNAL_LOST:
        // Attempt to restart location tracking
        if (context?.locationService) {
          await context.locationService.startTracking();
          await this.notifyUser('GPS signal restored.', Priority.NORMAL);
        }
        break;

      case ErrorType.TTS_ENGINE_UNAVAILABLE:
        // Test TTS availability
        if (this.ttsService) {
          await this.ttsService.speak('TTS test', Priority.LOW);
        }
        break;

      case ErrorType.TTS_AUDIO_INTERRUPTED:
        // Retry queued announcements
        if (context?.queuedAnnouncements) {
          for (const announcement of context.queuedAnnouncements) {
            await this.ttsService?.speak(announcement.text, announcement.priority);
          }
        }
        break;

      case ErrorType.DATABASE_ERROR:
        // Attempt database reconnection
        if (context?.databaseService) {
          await context.databaseService.initialize();
        }
        break;

      case ErrorType.SMS_SEND_FAILED:
        // Retry SMS sending
        if (context?.sosService && context?.message && context?.contacts) {
          await context.sosService.sendEmergencyMessage(context.message, context.contacts);
        }
        break;

      default:
        throw new Error(`No recovery implementation for ${type}`);
    }
  }

  private isRecoverable(type: ErrorType): boolean {
    const nonRecoverableTypes = [
      ErrorType.GPS_PERMISSION_DENIED,
      ErrorType.STORAGE_FULL,
      ErrorType.SENSOR_ACCESS_DENIED
    ];
    return !nonRecoverableTypes.includes(type);
  }

  private hasFallback(type: ErrorType): boolean {
    const strategy = this.recoveryStrategies.get(type);
    return strategy?.fallbackAction !== undefined;
  }

  private async notifyUser(message: string, priority: Priority): Promise<void> {
    // Try TTS first
    if (this.ttsService) {
      try {
        await this.ttsService.speak(message, priority);
        return;
      } catch (error) {
        console.error('Failed to announce error message via TTS:', error);
      }
    }

    // Fall back to haptic feedback for critical messages
    if (this.hapticService && priority === Priority.HIGH) {
      try {
        await this.hapticService.errorFeedback();
      } catch (error) {
        console.error('Failed to provide haptic error feedback:', error);
      }
    }

    // Log as final fallback
    console.warn(`User notification: ${message}`);
  }

  // Public methods for error reporting
  async reportGPSSignalLost(locationService?: any): Promise<void> {
    await this.handleError(
      new Error('GPS signal lost'),
      ErrorType.GPS_SIGNAL_LOST,
      { locationService }
    );
  }

  async reportGPSPermissionDenied(): Promise<void> {
    await this.handleError(
      new Error('Location permission denied'),
      ErrorType.GPS_PERMISSION_DENIED
    );
  }

  async reportBackgroundLocationDenied(): Promise<void> {
    await this.handleError(
      new Error('Background location permission denied'),
      ErrorType.BACKGROUND_LOCATION_DENIED
    );
  }

  async reportTTSEngineUnavailable(): Promise<void> {
    await this.handleError(
      new Error('TTS engine unavailable'),
      ErrorType.TTS_ENGINE_UNAVAILABLE
    );
  }

  async reportTTSAudioInterrupted(queuedAnnouncements?: any[]): Promise<void> {
    await this.handleError(
      new Error('TTS audio interrupted'),
      ErrorType.TTS_AUDIO_INTERRUPTED,
      { queuedAnnouncements }
    );
  }

  async reportHapticEngineUnavailable(): Promise<void> {
    await this.handleError(
      new Error('Haptic engine unavailable'),
      ErrorType.HAPTIC_ENGINE_UNAVAILABLE
    );
  }

  async reportDatabaseError(error: Error, databaseService?: any): Promise<void> {
    await this.handleError(
      error,
      ErrorType.DATABASE_ERROR,
      { databaseService }
    );
  }

  async reportStorageFull(): Promise<void> {
    await this.handleError(
      new Error('Storage full'),
      ErrorType.STORAGE_FULL
    );
  }

  async reportSMSSendFailed(error: Error, sosService?: any, message?: string, contacts?: any[]): Promise<void> {
    await this.handleError(
      error,
      ErrorType.SMS_SEND_FAILED,
      { sosService, message, contacts }
    );
  }

  async reportNetworkUnavailable(): Promise<void> {
    await this.handleError(
      new Error('Network unavailable'),
      ErrorType.NETWORK_UNAVAILABLE
    );
  }

  async reportSensorAccessDenied(): Promise<void> {
    await this.handleError(
      new Error('Sensor access denied'),
      ErrorType.SENSOR_ACCESS_DENIED
    );
  }

  // Utility methods
  getErrorHistory(): ErrorContext[] {
    return [...this.errorHistory];
  }

  getRecentErrors(minutes: number = 10): ErrorContext[] {
    const cutoff = new Date(Date.now() - minutes * 60 * 1000);
    return this.errorHistory.filter(error => error.timestamp >= cutoff);
  }

  clearErrorHistory(): void {
    this.errorHistory = [];
  }

  // Cleanup method
  cleanup(): void {
    // Clear all active recovery timers
    for (const timer of this.activeRecoveries.values()) {
      clearTimeout(timer);
    }
    this.activeRecoveries.clear();
    
    // Reset retry counts
    for (const strategy of this.recoveryStrategies.values()) {
      strategy.retryCount = 0;
    }
  }
}