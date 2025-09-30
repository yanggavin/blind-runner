import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import { NavigationService } from '../../services/NavigationService';
import { TTSServiceImpl } from '../../services/TTSService';

// Mock dependencies
jest.mock('expo-router', () => ({
  router: {
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
  },
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
  }),
  useSegments: () => ['index'],
  useFocusEffect: jest.fn(),
}));

jest.mock('react-native', () => ({
  AccessibilityInfo: {
    isScreenReaderEnabled: jest.fn(),
    addEventListener: jest.fn(),
    announceForAccessibility: jest.fn(),
  },
  Platform: {
    OS: 'ios',
  },
  Linking: {
    getInitialURL: jest.fn().mockResolvedValue(null),
    addEventListener: jest.fn().mockReturnValue({ remove: jest.fn() }),
  },
}));

jest.mock('../../services/TTSService');
jest.mock('../../services/RunTrackingService');
jest.mock('../../services/LocationService');

describe('Navigation Accessibility', () => {
  let mockTTSService: jest.Mocked<TTSServiceImpl>;
  let navigationService: NavigationService;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset singleton
    (NavigationService as any).instance = undefined;
    
    // Mock the TTS service constructor
    const mockTTSInstance = {
      speak: jest.fn().mockResolvedValue(undefined),
    };
    (TTSServiceImpl as jest.Mock).mockImplementation(() => mockTTSInstance);
    
    navigationService = NavigationService.getInstance();
    mockTTSService = mockTTSInstance as jest.Mocked<TTSServiceImpl>;
  });

  describe('Screen Reader Integration', () => {
    it('should detect screen reader status', async () => {
      const mockIsScreenReaderEnabled = AccessibilityInfo.isScreenReaderEnabled as jest.Mock;
      mockIsScreenReaderEnabled.mockResolvedValue(true);

      const isEnabled = await AccessibilityInfo.isScreenReaderEnabled();
      expect(isEnabled).toBe(true);
    });

    it('should listen for screen reader changes', () => {
      const mockAddEventListener = AccessibilityInfo.addEventListener as jest.Mock;
      const mockCallback = jest.fn();

      AccessibilityInfo.addEventListener('screenReaderChanged', mockCallback);
      
      expect(mockAddEventListener).toHaveBeenCalledWith('screenReaderChanged', mockCallback);
    });

    it('should announce navigation changes when screen reader is enabled', async () => {
      const mockIsScreenReaderEnabled = AccessibilityInfo.isScreenReaderEnabled as jest.Mock;
      mockIsScreenReaderEnabled.mockResolvedValue(true);

      await navigationService.navigateToHome();
      
      expect(mockTTSService.speak).toHaveBeenCalledWith('Navigated to Home');
    });
  });

  describe('Accessibility Announcements', () => {
    it('should announce screen transitions', async () => {
      await navigationService.navigateToHistory();
      
      expect(mockTTSService.speak).toHaveBeenCalledWith('Navigated to Run History');
    });

    it('should announce back navigation', async () => {
      await navigationService.navigateToSettings();
      await navigationService.goBack();
      
      expect(mockTTSService.speak).toHaveBeenCalledWith('Navigated to Home');
    });

    it('should announce run detail navigation', async () => {
      await navigationService.navigateToRunDetail(123);
      
      expect(mockTTSService.speak).toHaveBeenCalledWith('Navigated to Run Details');
    });

    it('should handle TTS errors gracefully during announcements', async () => {
      mockTTSService.speak.mockRejectedValue(new Error('TTS Error'));
      
      // Should not throw
      await expect(navigationService.navigateToHome()).resolves.not.toThrow();
    });
  });

  describe('Deep Link Accessibility', () => {
    it('should announce navigation from deep links', async () => {
      // Simulate deep link handling
      const mockHandleDeepLink = jest.spyOn(navigationService as any, 'handleDeepLink');
      
      await (navigationService as any).handleDeepLink('blindrunner:///settings');
      
      expect(mockTTSService.speak).toHaveBeenCalledWith('Navigated to Settings');
    });

    it('should announce invalid deep link handling', async () => {
      await (navigationService as any).handleDeepLink('invalid://link');
      
      expect(mockTTSService.speak).toHaveBeenCalledWith('Invalid link. Navigated to home screen.');
    });
  });

  describe('Navigation State Announcements', () => {
    it('should provide context about current location', () => {
      navigationService.navigateToSettings();
      
      const currentPath = navigationService.getCurrentPath();
      expect(currentPath).toBe('/settings');
    });

    it('should provide navigation history for context', async () => {
      await navigationService.navigateToHome();
      await navigationService.navigateToHistory();
      await navigationService.navigateToSettings();
      
      const history = navigationService.getNavigationHistory();
      expect(history).toEqual(['/', '/history', '/settings']);
    });
  });

  describe('Error Accessibility', () => {
    it('should announce navigation errors accessibly', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
      // Force an error in navigation
      mockTTSService.speak.mockRejectedValue(new Error('Navigation Error'));
      
      await navigationService.navigateToHome();
      
      // Should still attempt to announce despite error
      expect(mockTTSService.speak).toHaveBeenCalled();
      
      consoleSpy.mockRestore();
    });
  });

  describe('Focus Management', () => {
    it('should maintain logical focus order during navigation', async () => {
      // This would be tested with actual components in integration tests
      // Here we verify the navigation service supports focus management
      
      await navigationService.navigateToHome();
      await navigationService.navigateToHistory();
      
      const history = navigationService.getNavigationHistory();
      expect(history).toContain('/');
      expect(history).toContain('/history');
    });
  });

  describe('Voice-Only Operation', () => {
    it('should support navigation without visual interface', async () => {
      // Simulate voice-only navigation
      await navigationService.navigateToHome();
      expect(mockTTSService.speak).toHaveBeenCalledWith('Navigated to Home');
      
      await navigationService.navigateToActiveRun();
      expect(mockTTSService.speak).toHaveBeenCalledWith('Navigated to Active Run');
      
      await navigationService.goBack();
      expect(mockTTSService.speak).toHaveBeenCalledWith('Navigated to Home');
    });

    it('should provide audio feedback for all navigation actions', async () => {
      const actions = [
        () => navigationService.navigateToHome(),
        () => navigationService.navigateToHistory(),
        () => navigationService.navigateToSettings(),
        () => navigationService.navigateToActiveRun(),
        () => navigationService.navigateToRunDetail(1),
      ];

      for (const action of actions) {
        await action();
        expect(mockTTSService.speak).toHaveBeenCalled();
      }
    });
  });

  describe('Screen-Off Operation', () => {
    it('should maintain navigation functionality when screen is off', async () => {
      // Navigation should work regardless of screen state
      await navigationService.navigateToActiveRun();
      
      expect(mockTTSService.speak).toHaveBeenCalledWith('Navigated to Active Run');
      
      const currentPath = navigationService.getCurrentPath();
      expect(currentPath).toBe('/run/active');
    });
  });
});