import * as Haptics from 'expo-haptics';
import { HapticService, VibrationPattern } from './interfaces';
import { ErrorHandlingService, ErrorType } from './ErrorHandlingService';

export class HapticServiceImpl implements HapticService {
  private isEnabled = true;
  private distanceBasedEnabled = true;
  private timeBasedEnabled = false;
  private errorHandler: ErrorHandlingService;
  private hapticAvailable = true;

  constructor() {
    this.errorHandler = ErrorHandlingService.getInstance();
    this.checkHapticAvailability();
  }

  async vibrate(pattern: VibrationPattern): Promise<void> {
    if (!this.isEnabled || !this.hapticAvailable) {
      return;
    }

    // Check if distance-based patterns are enabled
    if ((pattern === VibrationPattern.KILOMETER || pattern === VibrationPattern.HALF_KILOMETER) && !this.distanceBasedEnabled) {
      return;
    }

    // Check if time-based patterns are enabled
    if (pattern === VibrationPattern.TIME_MILESTONE && !this.timeBasedEnabled) {
      return;
    }

    try {
      switch (pattern) {
        case VibrationPattern.KILOMETER:
          await this.kilometerPattern();
          break;
        case VibrationPattern.HALF_KILOMETER:
          await this.halfKilometerPattern();
          break;
        case VibrationPattern.TIME_MILESTONE:
          await this.timeMilestonePattern();
          break;
        case VibrationPattern.START_CONFIRMATION:
          await this.startConfirmationPattern();
          break;
        case VibrationPattern.PAUSE_CONFIRMATION:
          await this.pauseConfirmationPattern();
          break;
        case VibrationPattern.RESUME_CONFIRMATION:
          await this.resumeConfirmationPattern();
          break;
        case VibrationPattern.STOP_CONFIRMATION:
          await this.stopConfirmationPattern();
          break;
        case VibrationPattern.BUTTON_PRESS:
          await this.buttonPressPattern();
          break;
        case VibrationPattern.ERROR:
          await this.errorPattern();
          break;
        case VibrationPattern.SUCCESS:
          await this.successPattern();
          break;
        case VibrationPattern.WARNING:
          await this.warningPattern();
          break;
        default:
          await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
    } catch (error) {
      console.error('Haptic feedback error:', error);
      await this.handleHapticError(error as Error);
    }
  }

  private async handleHapticError(error: Error): Promise<void> {
    // Check if haptic engine is unavailable
    if (error.message.includes('not available') || error.message.includes('unsupported')) {
      this.hapticAvailable = false;
      await this.errorHandler.reportHapticEngineUnavailable();
    } else {
      // Log other haptic errors but don't disable the service
      console.error('Haptic error (non-critical):', error);
    }
  }

  private async checkHapticAvailability(): Promise<void> {
    try {
      // Test haptic with a light impact
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      this.hapticAvailable = true;
    } catch (error) {
      console.error('Haptic availability check failed:', error);
      this.hapticAvailable = false;
      await this.errorHandler.reportHapticEngineUnavailable();
    }
  }

  async kilometerMilestone(): Promise<void> {
    await this.vibrate(VibrationPattern.KILOMETER);
  }

  async halfKilometerMilestone(): Promise<void> {
    await this.vibrate(VibrationPattern.HALF_KILOMETER);
  }

  async timeMilestone(minutes: number): Promise<void> {
    await this.vibrate(VibrationPattern.TIME_MILESTONE);
  }

  async runStartConfirmation(): Promise<void> {
    await this.vibrate(VibrationPattern.START_CONFIRMATION);
  }

  async runPauseConfirmation(): Promise<void> {
    await this.vibrate(VibrationPattern.PAUSE_CONFIRMATION);
  }

  async runResumeConfirmation(): Promise<void> {
    await this.vibrate(VibrationPattern.RESUME_CONFIRMATION);
  }

  async runStopConfirmation(): Promise<void> {
    await this.vibrate(VibrationPattern.STOP_CONFIRMATION);
  }

  // Pattern implementations
  private async kilometerPattern(): Promise<void> {
    // Strong triple vibration for kilometer milestones
    const vibrations = [
      () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy),
      () => this.delay(200),
      () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy),
      () => this.delay(200),
      () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy),
    ];

    for (const vibration of vibrations) {
      try {
        await vibration();
      } catch (error) {
        console.error('Haptic vibration error:', error);
        // Continue with next vibration even if one fails
      }
    }
  }

  private async halfKilometerPattern(): Promise<void> {
    // Medium double vibration for 500m milestones
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await this.delay(150);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }

  private async timeMilestonePattern(): Promise<void> {
    // Single medium vibration for time milestones (every 5 minutes by default)
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }

  private async startConfirmationPattern(): Promise<void> {
    // Single strong vibration for run start
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  }

  private async pauseConfirmationPattern(): Promise<void> {
    // Two medium vibrations for pause
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await this.delay(150);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }

  private async resumeConfirmationPattern(): Promise<void> {
    // Single medium vibration for resume
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }

  private async stopConfirmationPattern(): Promise<void> {
    // Long vibration followed by two short ones for run stop
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    await this.delay(300);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await this.delay(100);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  private async buttonPressPattern(): Promise<void> {
    // Light vibration for button press
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  private async errorPattern(): Promise<void> {
    // Error notification pattern
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  }

  private async successPattern(): Promise<void> {
    // Success notification pattern
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  private async warningPattern(): Promise<void> {
    // Warning notification pattern
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  }

  // Additional haptic feedback methods
  async buttonPress(): Promise<void> {
    await this.vibrate(VibrationPattern.BUTTON_PRESS);
  }

  async errorFeedback(): Promise<void> {
    await this.vibrate(VibrationPattern.ERROR);
  }

  async successFeedback(): Promise<void> {
    await this.vibrate(VibrationPattern.SUCCESS);
  }

  async warningFeedback(): Promise<void> {
    await this.vibrate(VibrationPattern.WARNING);
  }

  // Configuration methods
  setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
  }

  getEnabled(): boolean {
    return this.isEnabled;
  }

  setDistanceBasedEnabled(enabled: boolean): void {
    this.distanceBasedEnabled = enabled;
  }

  getDistanceBasedEnabled(): boolean {
    return this.distanceBasedEnabled;
  }

  setTimeBasedEnabled(enabled: boolean): void {
    this.timeBasedEnabled = enabled;
  }

  getTimeBasedEnabled(): boolean {
    return this.timeBasedEnabled;
  }

  // Status methods
  isHapticAvailable(): boolean {
    return this.hapticAvailable;
  }

  async recheckHapticAvailability(): Promise<boolean> {
    await this.checkHapticAvailability();
    return this.hapticAvailable;
  }

  // Utility method for delays
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}