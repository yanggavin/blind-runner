import { NavigationService } from '../../services/NavigationService';
import { TTSServiceImpl } from '../../services/TTSService';

// Mock dependencies
jest.mock('expo-router', () => ({
  router: {
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
  },
}));

jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  Linking: {
    getInitialURL: jest.fn().mockResolvedValue(null),
    addEventListener: jest.fn().mockReturnValue({ remove: jest.fn() }),
  },
}));

jest.mock('../../services/TTSService');

describe('Navigation Flow Integration', () => {
  let navigationService: NavigationService;
  let mockTTSService: jest.Mocked<TTSServiceImpl>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset router mock to normal behavior
    const { router } = require('expo-router');
    router.push.mockImplementation(() => {});
    
    // Reset singletons
    (NavigationService as any).instance = undefined;
    
    // Mock the TTS service constructor
    const mockTTSInstance = {
      speak: jest.fn().mockResolvedValue(undefined),
    };
    (TTSServiceImpl as jest.Mock).mockImplementation(() => mockTTSInstance);
    
    navigationService = NavigationService.getInstance();
    mockTTSService = mockTTSInstance as jest.Mocked<TTSServiceImpl>;
  });

  describe('Complete User Journey', () => {
    it('should handle complete run workflow navigation', async () => {
      const { router } = require('expo-router');
      
      // 1. Start at home
      await navigationService.navigateToHome();
      expect(router.push).toHaveBeenCalledWith('/');
      expect(mockTTSService.speak).toHaveBeenCalledWith('Navigated to Home');
      
      // 2. Navigate to active run (simulating run start)
      await navigationService.navigateToActiveRun();
      expect(router.push).toHaveBeenCalledWith('/run/active');
      expect(mockTTSService.speak).toHaveBeenCalledWith('Navigated to Active Run');
      
      // 3. Navigate to run details (simulating run completion)
      await navigationService.navigateToRunDetail(123);
      expect(router.push).toHaveBeenCalledWith('/history/123');
      expect(mockTTSService.speak).toHaveBeenCalledWith('Navigated to Run Details');
      
      // 4. Navigate to history
      await navigationService.navigateToHistory();
      expect(router.push).toHaveBeenCalledWith('/history');
      expect(mockTTSService.speak).toHaveBeenCalledWith('Navigated to Run History');
      
      // 5. Navigate to settings
      await navigationService.navigateToSettings();
      expect(router.push).toHaveBeenCalledWith('/settings');
      expect(mockTTSService.speak).toHaveBeenCalledWith('Navigated to Settings');
      
      // Verify navigation history
      const history = navigationService.getNavigationHistory();
      expect(history).toEqual(['/', '/run/active', '/history/123', '/history', '/settings']);
    });

    it('should handle back navigation through the journey', async () => {
      const { router } = require('expo-router');
      
      // Build up navigation history
      await navigationService.navigateToHome();
      await navigationService.navigateToHistory();
      await navigationService.navigateToSettings();
      
      // Go back through history
      await navigationService.goBack();
      expect(router.push).toHaveBeenLastCalledWith('/history');
      expect(mockTTSService.speak).toHaveBeenLastCalledWith('Navigated to Run History');
      
      await navigationService.goBack();
      expect(router.push).toHaveBeenLastCalledWith('/');
      expect(mockTTSService.speak).toHaveBeenLastCalledWith('Navigated to Home');
    });
  });

  describe('Deep Link Integration', () => {
    it('should handle deep link to run details', async () => {
      const { router } = require('expo-router');
      
      await (navigationService as any).handleDeepLink('blindrunner:///history/123');
      
      expect(router.push).toHaveBeenCalledWith('/history/123');
      expect(mockTTSService.speak).toHaveBeenCalledWith('Navigated to Run Details');
    });

    it('should handle deep link to settings', async () => {
      const { router } = require('expo-router');
      
      await (navigationService as any).handleDeepLink('blindrunner:///settings');
      
      expect(router.push).toHaveBeenCalledWith('/settings');
      expect(mockTTSService.speak).toHaveBeenCalledWith('Navigated to Settings');
    });

    it('should handle invalid deep links gracefully', async () => {
      const { router } = require('expo-router');
      
      await (navigationService as any).handleDeepLink('invalid://link/path');
      
      expect(router.push).toHaveBeenCalledWith('/');
      expect(mockTTSService.speak).toHaveBeenCalledWith('Invalid link. Navigated to home screen.');
    });

    it('should handle malformed URLs', async () => {
      const { router } = require('expo-router');
      
      await (navigationService as any).handleDeepLink('not-a-url');
      
      expect(router.push).toHaveBeenCalledWith('/');
      expect(mockTTSService.speak).toHaveBeenCalledWith('Invalid link. Navigated to home screen.');
    });
  });

  describe('Active Run State Management', () => {
    it('should navigate to active run', async () => {
      const { router } = require('expo-router');
      
      await navigationService.navigateToActiveRun();
      
      expect(router.push).toHaveBeenCalledWith('/run/active');
      expect(mockTTSService.speak).toHaveBeenCalledWith('Navigated to Active Run');
    });

    it('should track current path correctly', async () => {
      await navigationService.navigateToHome();
      
      const currentPath = navigationService.getCurrentPath();
      expect(currentPath).toBe('/');
    });
  });

  describe('Error Handling in Navigation Flow', () => {
    it('should handle navigation errors gracefully', async () => {
      const { router } = require('expo-router');
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
      // Mock router error
      router.push.mockImplementation(() => {
        throw new Error('Navigation Error');
      });
      
      // Should not throw
      await expect(navigationService.navigateToHome()).resolves.not.toThrow();
      
      consoleSpy.mockRestore();
    });

    it('should handle TTS errors during navigation flow', async () => {
      mockTTSService.speak.mockRejectedValue(new Error('TTS Error'));
      
      // Should complete navigation despite TTS error
      await navigationService.navigateToHome();
      await navigationService.navigateToHistory();
      
      const history = navigationService.getNavigationHistory();
      expect(history).toEqual(['/', '/history']);
    });

    it('should handle navigation to run details', async () => {
      const { router } = require('expo-router');
      
      // Should navigate to run details
      await navigationService.navigateToRunDetail(999);
      
      expect(router.push).toHaveBeenCalledWith('/history/999');
      expect(mockTTSService.speak).toHaveBeenCalledWith('Navigated to Run Details');
    });
  });

  describe('Accessibility Integration', () => {
    it('should provide consistent announcements throughout navigation flow', async () => {
      const expectedAnnouncements = [
        'Navigated to Home',
        'Navigated to Run History',
        'Navigated to Run Details',
        'Navigated to Settings',
        'Navigated to Active Run',
      ];
      
      await navigationService.navigateToHome();
      await navigationService.navigateToHistory();
      await navigationService.navigateToRunDetail(1);
      await navigationService.navigateToSettings();
      await navigationService.navigateToActiveRun();
      
      expectedAnnouncements.forEach((announcement) => {
        expect(mockTTSService.speak).toHaveBeenCalledWith(announcement);
      });
    });

    it('should maintain navigation context for screen readers', async () => {
      await navigationService.navigateToHome();
      await navigationService.navigateToHistory();
      await navigationService.navigateToRunDetail(123);
      
      const currentPath = navigationService.getCurrentPath();
      expect(currentPath).toBe('/history/123');
      
      const history = navigationService.getNavigationHistory();
      expect(history).toContain('/');
      expect(history).toContain('/history');
      expect(history).toContain('/history/123');
    });
  });

  describe('Performance and Memory', () => {
    it('should limit navigation history to prevent memory issues', async () => {
      // Navigate to many different run details
      for (let i = 0; i < 15; i++) {
        await navigationService.navigateToRunDetail(i);
      }
      
      const history = navigationService.getNavigationHistory();
      expect(history.length).toBeLessThanOrEqual(10);
    });

    it('should clean up resources properly', () => {
      const history = navigationService.getNavigationHistory();
      expect(Array.isArray(history)).toBe(true);
      
      navigationService.clearHistory();
      
      const clearedHistory = navigationService.getNavigationHistory();
      expect(clearedHistory).toEqual([]);
    });
  });
});