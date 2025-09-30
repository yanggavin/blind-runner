import * as Speech from 'expo-speech';
import { TTSService, Priority, RunMetrics, VoiceSettings, RunSummary } from './interfaces';
import { AppSettings } from '../models/types';
import { ErrorHandlingService, ErrorType } from './ErrorHandlingService';

export interface AnnouncementSettings {
  timeIntervalMinutes: number;
  distanceIntervalMeters: number;
  enableTimeAnnouncements: boolean;
  enableDistanceAnnouncements: boolean;
}

export class TTSServiceImpl implements TTSService {
  private voiceSettings: VoiceSettings = {
    rate: 1.0,
    pitch: 1.0,
  };
  private speechQueue: Array<{ text: string; priority: Priority }> = [];
  private isSpeaking = false;
  private errorHandler: ErrorHandlingService;
  private ttsAvailable = true;
  private fallbackMode = false;
  private queuedAnnouncements: Array<{ text: string; priority: Priority }> = [];
  
  // Periodic announcement tracking
  private announcementSettings: AnnouncementSettings = {
    timeIntervalMinutes: 5,
    distanceIntervalMeters: 1000,
    enableTimeAnnouncements: true,
    enableDistanceAnnouncements: true,
  };
  private lastTimeAnnouncement = 0; // seconds
  private lastDistanceAnnouncement = 0; // meters
  private announcementTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.errorHandler = ErrorHandlingService.getInstance();
    this.checkTTSAvailability();
  }

  async speak(text: string, priority: Priority = Priority.NORMAL): Promise<void> {
    // Check if TTS is available
    if (!this.ttsAvailable) {
      if (this.fallbackMode) {
        // Store for later retry
        this.queuedAnnouncements.push({ text, priority });
        return;
      } else {
        await this.errorHandler.reportTTSEngineUnavailable();
        return;
      }
    }

    // Add to queue based on priority
    if (priority === Priority.HIGH) {
      // High priority interrupts current speech and goes to front of queue
      if (this.isSpeaking) {
        try {
          Speech.stop();
          this.isSpeaking = false;
        } catch (error) {
          console.error('Failed to stop current speech:', error);
        }
      }
      this.speechQueue.unshift({ text, priority });
    } else {
      this.speechQueue.push({ text, priority });
    }

    // Process queue if not currently speaking
    if (!this.isSpeaking) {
      await this.processQueue();
    }
  }

  async announceMetrics(metrics: RunMetrics): Promise<void> {
    const distanceKm = (metrics.distance / 1000).toFixed(2);
    const durationMinutes = Math.floor(metrics.duration / 60);
    const durationSeconds = metrics.duration % 60;
    const paceMinutes = Math.floor(metrics.currentPace);
    const paceSeconds = Math.round((metrics.currentPace - paceMinutes) * 60);

    let announcement = `Distance: ${distanceKm} kilometers. `;
    announcement += `Time: ${durationMinutes} minutes and ${durationSeconds} seconds. `;
    announcement += `Current pace: ${paceMinutes} minutes and ${paceSeconds} seconds per kilometer.`;

    await this.speak(announcement, Priority.NORMAL);
  }

  async announceRunStart(): Promise<void> {
    await this.speak('Run started. GPS tracking active.', Priority.HIGH);
  }

  async announceRunPause(): Promise<void> {
    await this.speak('Run paused.', Priority.HIGH);
  }

  async announceRunResume(): Promise<void> {
    await this.speak('Run resumed.', Priority.HIGH);
  }

  async announceRunComplete(summary: RunSummary): Promise<void> {
    const distanceKm = (summary.totalDistance / 1000).toFixed(2);
    const durationMinutes = Math.floor(summary.totalDuration / 60);
    const durationSeconds = summary.totalDuration % 60;
    const paceMinutes = Math.floor(summary.averagePace);
    const paceSeconds = Math.round((summary.averagePace - paceMinutes) * 60);

    let announcement = `Run completed! `;
    announcement += `Total distance: ${distanceKm} kilometers. `;
    announcement += `Total time: ${durationMinutes} minutes and ${durationSeconds} seconds. `;
    announcement += `Average pace: ${paceMinutes} minutes and ${paceSeconds} seconds per kilometer.`;

    if (summary.splits.length > 0) {
      announcement += ` You completed ${summary.splits.length} kilometer splits.`;
    }

    await this.speak(announcement, Priority.HIGH);
  }

  setVoiceSettings(settings: VoiceSettings): void {
    this.voiceSettings = { ...settings };
  }

  // Configure periodic announcement settings
  setAnnouncementSettings(settings: Partial<AnnouncementSettings>): void {
    this.announcementSettings = { ...this.announcementSettings, ...settings };
  }

  // Configure from app settings
  configureFromAppSettings(appSettings: AppSettings): void {
    this.setVoiceSettings({
      rate: appSettings.voiceRate,
      pitch: appSettings.voicePitch,
    });
    
    this.setAnnouncementSettings({
      timeIntervalMinutes: appSettings.announcementFrequencyMinutes,
      distanceIntervalMeters: appSettings.announcementFrequencyDistance,
      enableTimeAnnouncements: true,
      enableDistanceAnnouncements: true,
    });
  }

  // Start periodic announcements during a run
  startPeriodicAnnouncements(getMetrics: () => RunMetrics): void {
    this.stopPeriodicAnnouncements();
    this.resetAnnouncementTracking();
    
    // Check for announcements every 30 seconds
    this.announcementTimer = setInterval(() => {
      const metrics = getMetrics();
      this.checkForPeriodicAnnouncements(metrics);
    }, 30000);
  }

  // Stop periodic announcements
  stopPeriodicAnnouncements(): void {
    if (this.announcementTimer) {
      clearInterval(this.announcementTimer);
      this.announcementTimer = null;
    }
  }

  // Reset announcement tracking (call when run starts)
  resetAnnouncementTracking(): void {
    this.lastTimeAnnouncement = 0;
    this.lastDistanceAnnouncement = 0;
  }

  // Check if periodic announcements are due
  private checkForPeriodicAnnouncements(metrics: RunMetrics): void {
    // Check for time-based announcements
    if (this.announcementSettings.enableTimeAnnouncements) {
      const intervalSeconds = this.announcementSettings.timeIntervalMinutes * 60;
      const timeSinceLastAnnouncement = metrics.duration - this.lastTimeAnnouncement;
      
      if (timeSinceLastAnnouncement >= intervalSeconds) {
        this.announceMetrics(metrics);
        this.lastTimeAnnouncement = metrics.duration;
      }
    }

    // Check for distance-based announcements
    if (this.announcementSettings.enableDistanceAnnouncements) {
      const distanceSinceLastAnnouncement = metrics.distance - this.lastDistanceAnnouncement;
      
      if (distanceSinceLastAnnouncement >= this.announcementSettings.distanceIntervalMeters) {
        this.announceMetrics(metrics);
        this.lastDistanceAnnouncement = metrics.distance;
      }
    }
  }

  // Get current announcement settings (useful for testing)
  getAnnouncementSettings(): AnnouncementSettings {
    return { ...this.announcementSettings };
  }

  // Get last announcement tracking values (useful for testing)
  getAnnouncementTracking(): { lastTime: number; lastDistance: number } {
    return {
      lastTime: this.lastTimeAnnouncement,
      lastDistance: this.lastDistanceAnnouncement,
    };
  }

  // Additional helper methods for specific announcements
  async announceKilometerSplit(splitNumber: number, splitTime: number): Promise<void> {
    const minutes = Math.floor(splitTime / 60);
    const seconds = splitTime % 60;
    const announcement = `Kilometer ${splitNumber} completed in ${minutes} minutes and ${seconds} seconds.`;
    await this.speak(announcement, Priority.NORMAL);
  }

  async announceAutoPause(): Promise<void> {
    await this.speak('Auto-pause activated.', Priority.HIGH);
  }

  async announceAutoResume(): Promise<void> {
    await this.speak('Auto-resume activated.', Priority.HIGH);
  }

  async announceGPSLost(): Promise<void> {
    await this.speak('GPS signal lost. Continuing time tracking.', Priority.HIGH);
  }

  async announceGPSRestored(): Promise<void> {
    await this.speak('GPS signal restored.', Priority.NORMAL);
  }

  private async processQueue(): Promise<void> {
    if (this.speechQueue.length === 0 || this.isSpeaking || !this.ttsAvailable) {
      return;
    }

    const nextItem = this.speechQueue.shift();
    if (!nextItem) {
      return;
    }

    this.isSpeaking = true;

    try {
      await new Promise<void>((resolve, reject) => {
        Speech.speak(nextItem.text, {
          rate: this.voiceSettings.rate,
          pitch: this.voiceSettings.pitch,
          onDone: () => {
            this.isSpeaking = false;
            resolve();
          },
          onError: (error) => {
            this.isSpeaking = false;
            reject(error);
          },
          onStopped: () => {
            this.isSpeaking = false;
            resolve();
          },
        });
      });

      // Process next item in queue
      await this.processQueue();
    } catch (error) {
      this.isSpeaking = false;
      console.error('TTS Error:', error);
      
      // Handle different types of TTS errors
      await this.handleTTSError(error as Error, nextItem);
      
      // Continue processing queue even if one item fails
      await this.processQueue();
    }
  }

  private async handleTTSError(error: Error, failedItem: { text: string; priority: Priority }): Promise<void> {
    // Check if TTS engine is completely unavailable
    if (error.message.includes('TTS engine') || error.message.includes('not available')) {
      this.ttsAvailable = false;
      await this.errorHandler.reportTTSEngineUnavailable();
    } else if (error.message.includes('interrupted') || error.message.includes('audio')) {
      // Audio interruption - queue for retry
      this.queuedAnnouncements.push(failedItem);
      await this.errorHandler.reportTTSAudioInterrupted(this.queuedAnnouncements);
    } else {
      // Generic TTS error
      console.error('Unhandled TTS error:', error);
    }
  }

  private async checkTTSAvailability(): Promise<void> {
    try {
      // Test TTS with a silent/short phrase
      await new Promise<void>((resolve, reject) => {
        Speech.speak('', {
          rate: 1.0,
          pitch: 1.0,
          onDone: () => resolve(),
          onError: (error) => reject(error),
        });
      });
      this.ttsAvailable = true;
    } catch (error) {
      console.error('TTS availability check failed:', error);
      this.ttsAvailable = false;
      await this.errorHandler.reportTTSEngineUnavailable();
    }
  }

  // Method to retry queued announcements
  async retryQueuedAnnouncements(): Promise<void> {
    if (!this.ttsAvailable || this.queuedAnnouncements.length === 0) {
      return;
    }

    const announcements = [...this.queuedAnnouncements];
    this.queuedAnnouncements = [];

    for (const announcement of announcements) {
      await this.speak(announcement.text, announcement.priority);
    }
  }

  // Method to enable/disable fallback mode
  setFallbackMode(enabled: boolean): void {
    this.fallbackMode = enabled;
    if (!enabled) {
      this.queuedAnnouncements = [];
    }
  }

  // Method to check TTS status
  isTTSAvailable(): boolean {
    return this.ttsAvailable;
  }

  // Method to force TTS availability recheck
  async recheckTTSAvailability(): Promise<boolean> {
    await this.checkTTSAvailability();
    if (this.ttsAvailable && this.queuedAnnouncements.length > 0) {
      await this.retryQueuedAnnouncements();
    }
    return this.ttsAvailable;
  }

  // Helper method to clear speech queue (useful for testing)
  clearQueue(): void {
    this.speechQueue = [];
    if (this.isSpeaking) {
      Speech.stop();
      this.isSpeaking = false;
    }
  }

  // Helper method to check if currently speaking (useful for testing)
  getIsSpeaking(): boolean {
    return this.isSpeaking;
  }

  // Helper method to get queue length (useful for testing)
  getQueueLength(): number {
    return this.speechQueue.length;
  }

  // Cleanup method to stop all timers and clear queue
  cleanup(): void {
    this.stopPeriodicAnnouncements();
    this.clearQueue();
  }
}