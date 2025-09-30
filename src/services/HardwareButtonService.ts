import { DeviceEventEmitter, NativeEventEmitter, NativeModules, Platform } from 'react-native';
import { SOSService } from './SOSService';

export interface HardwareButtonServiceInterface {
  startListening(): void;
  stopListening(): void;
  setSOSService(sosService: SOSService): void;
}

export class HardwareButtonService implements HardwareButtonServiceInterface {
  private sosService: SOSService | null = null;
  private isListening: boolean = false;
  private longPressTimer: NodeJS.Timeout | null = null;
  private pressStartTime: number = 0;
  private readonly LONG_PRESS_DURATION = 3000; // 3 seconds
  private volumeUpPressed: boolean = false;
  private volumeDownPressed: boolean = false;

  constructor() {
    this.handleVolumeButtonPress = this.handleVolumeButtonPress.bind(this);
    this.handleVolumeButtonRelease = this.handleVolumeButtonRelease.bind(this);
  }

  setSOSService(sosService: SOSService): void {
    this.sosService = sosService;
  }

  startListening(): void {
    if (this.isListening) {
      return;
    }

    this.isListening = true;

    if (Platform.OS === 'android') {
      // Android volume button handling
      DeviceEventEmitter.addListener('onVolumeButtonPressed', this.handleVolumeButtonPress);
      DeviceEventEmitter.addListener('onVolumeButtonReleased', this.handleVolumeButtonRelease);
    } else if (Platform.OS === 'ios') {
      // iOS volume button handling (requires native module)
      // For now, we'll implement a fallback approach
      this.setupiOSVolumeButtonHandling();
    }
  }

  stopListening(): void {
    if (!this.isListening) {
      return;
    }

    this.isListening = false;

    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }

    if (Platform.OS === 'android') {
      DeviceEventEmitter.removeAllListeners('onVolumeButtonPressed');
      DeviceEventEmitter.removeAllListeners('onVolumeButtonReleased');
    }

    this.volumeUpPressed = false;
    this.volumeDownPressed = false;
  }

  private handleVolumeButtonPress(event: { button: 'up' | 'down' }): void {
    if (!this.isListening || !this.sosService) {
      return;
    }

    if (event.button === 'up') {
      this.volumeUpPressed = true;
    } else if (event.button === 'down') {
      this.volumeDownPressed = true;
    }

    // Check if both volume buttons are pressed
    if (this.volumeUpPressed && this.volumeDownPressed) {
      this.startLongPressDetection();
    }
  }

  private handleVolumeButtonRelease(event: { button: 'up' | 'down' }): void {
    if (!this.isListening) {
      return;
    }

    if (event.button === 'up') {
      this.volumeUpPressed = false;
    } else if (event.button === 'down') {
      this.volumeDownPressed = false;
    }

    // If either button is released, cancel the long press
    if (!this.volumeUpPressed || !this.volumeDownPressed) {
      this.cancelLongPressDetection();
    }
  }

  private startLongPressDetection(): void {
    if (this.longPressTimer) {
      return; // Already detecting
    }

    this.pressStartTime = Date.now();
    this.longPressTimer = setTimeout(() => {
      this.triggerSOS();
    }, this.LONG_PRESS_DURATION);
  }

  private cancelLongPressDetection(): void {
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
  }

  private async triggerSOS(): void {
    if (!this.sosService) {
      console.error('SOS service not configured');
      return;
    }

    try {
      console.log('Hardware button SOS triggered');
      await this.sosService.activateSOS();
    } catch (error) {
      console.error('Failed to activate SOS from hardware button:', error);
    } finally {
      this.cancelLongPressDetection();
      this.volumeUpPressed = false;
      this.volumeDownPressed = false;
    }
  }

  private setupiOSVolumeButtonHandling(): void {
    // iOS implementation would require a native module
    // For now, we'll provide a fallback that can be triggered programmatically
    console.warn('iOS hardware button detection requires native module implementation');
    
    // Alternative: Use app state changes or other iOS-specific events
    // This is a simplified implementation that could be enhanced with native modules
  }

  /**
   * Manual SOS trigger for testing or alternative activation methods
   */
  async triggerSOSManually(): Promise<void> {
    if (!this.sosService) {
      throw new Error('SOS service not configured');
    }

    await this.sosService.activateSOS();
  }

  /**
   * Test the long press detection without actually triggering SOS
   */
  async testLongPressDetection(): Promise<void> {
    if (!this.sosService) {
      throw new Error('SOS service not configured');
    }

    await this.sosService.testSOS();
  }
}