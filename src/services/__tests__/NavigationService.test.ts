import { NavigationService } from '../NavigationService';
import { TTSServiceImpl } from '../TTSService';

// Mock expo-router
jest.mock('expo-router', () => ({
  router: {
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
  },
}));

// Mock react-native
jest.mock('react-native', () => ({
  Platform: {
    OS: 'ios',
  },
  Linking: {
    getInitialURL: jest.fn().mockResolvedValue(null),
    addEventListener: jest.fn().mockReturnValue({ remove: jest.fn() }),
  },
}));

// Mock TTSService
jest.mock('../TTSService');

describe('NavigationService', () => {
  let navigationService: NavigationService;
  let mockTTSService: jest.Mocked<TTSServiceImpl>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset singleton instance
    (NavigationService as any).instance = undefined;
    
    // Mock the TTS service constructor
    const mockTTSInstance = {
      speak: jest.fn().mockResolvedValue(undefined),
    };
    (TTSServiceImpl as jest.Mock).mockImplementation(() => mockTTSInstance);
    
    navigationService = NavigationService.getInstance();
    mockTTSService = mockTTSInstance as jest.Mocked<TTSServiceImpl>;
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance', () => {
      const instance1 = NavigationService.getInstance();
      const instance2 = NavigationService.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('Navigation Methods', () => {
    it('should navigate to home and announce', async () => {
      const { router } = require('expo-router');
      
      await navigationService.navigateToHome();
      
      expect(router.push).toHaveBeenCalledWith('/');
      expect(mockTTSService.speak).toHaveBeenCalledWith('Navigated to Home');
    });

    it('should navigate to history and announce', async () => {
      const { router } = require('expo-router');
      
      await navigationService.navigateToHistory();
      
      expect(router.push).toHaveBeenCalledWith('/history');
      expect(mockTTSService.speak).toHaveBeenCalledWith('Navigated to Run History');
    });

    it('should navigate to settings and announce', async () => {
      const { router } = require('expo-router');
      
      await navigationService.navigateToSettings();
      
      expect(router.push).toHaveBeenCalledWith('/settings');
      expect(mockTTSService.speak).toHaveBeenCalledWith('Navigated to Settings');
    });

    it('should navigate to active run and announce', async () => {
      const { router } = require('expo-router');
      
      await navigationService.navigateToActiveRun();
      
      expect(router.push).toHaveBeenCalledWith('/run/active');
      expect(mockTTSService.speak).toHaveBeenCalledWith('Navigated to Active Run');
    });

    it('should navigate to run detail and announce', async () => {
      const { router } = require('expo-router');
      const runId = 123;
      
      await navigationService.navigateToRunDetail(runId);
      
      expect(router.push).toHaveBeenCalledWith('/history/123');
      expect(mockTTSService.speak).toHaveBeenCalledWith('Navigated to Run Details');
    });
  });

  describe('Navigation History', () => {
    it('should track navigation history', async () => {
      await navigationService.navigateToHome();
      await navigationService.navigateToHistory();
      await navigationService.navigateToSettings();
      
      const history = navigationService.getNavigationHistory();
      expect(history).toEqual(['/', '/history', '/settings']);
    });

    it('should not add duplicate consecutive entries', async () => {
      await navigationService.navigateToHome();
      await navigationService.navigateToHome();
      
      const history = navigationService.getNavigationHistory();
      expect(history).toEqual(['/']);
    });

    it('should limit history to 10 entries', async () => {
      // Add 15 different paths
      for (let i = 0; i < 15; i++) {
        await navigationService.navigateToRunDetail(i);
      }
      
      const history = navigationService.getNavigationHistory();
      expect(history.length).toBe(10);
      expect(history[0]).toBe('/history/5'); // First 5 should be removed
      expect(history[9]).toBe('/history/14'); // Last entry should be 14
    });

    it('should go back to previous page', async () => {
      const { router } = require('expo-router');
      
      await navigationService.navigateToHome();
      await navigationService.navigateToHistory();
      await navigationService.goBack();
      
      expect(router.push).toHaveBeenLastCalledWith('/');
      expect(mockTTSService.speak).toHaveBeenLastCalledWith('Navigated to Home');
    });

    it('should go to home if no history', async () => {
      const { router } = require('expo-router');
      
      await navigationService.goBack();
      
      expect(router.push).toHaveBeenCalledWith('/');
      expect(mockTTSService.speak).toHaveBeenCalledWith('Navigated to Home');
    });

    it('should clear history', () => {
      navigationService.navigateToHome();
      navigationService.clearHistory();
      
      const history = navigationService.getNavigationHistory();
      expect(history).toEqual([]);
    });
  });

  describe('Deep Link Generation', () => {
    it('should generate run detail link', () => {
      const link = navigationService.generateRunDetailLink(123);
      expect(link).toBe('blindrunner:///history/123');
    });

    it('should generate settings link', () => {
      const link = navigationService.generateSettingsLink();
      expect(link).toBe('blindrunner:///settings');
    });
  });

  describe('Current Path', () => {
    it('should return current path', async () => {
      await navigationService.navigateToSettings();
      
      const currentPath = navigationService.getCurrentPath();
      expect(currentPath).toBe('/settings');
    });

    it('should return default path when no navigation', () => {
      const currentPath = navigationService.getCurrentPath();
      expect(currentPath).toBe('/');
    });
  });

  describe('Error Handling', () => {
    it('should handle TTS errors gracefully', async () => {
      mockTTSService.speak.mockRejectedValue(new Error('TTS Error'));
      
      // Should not throw
      await expect(navigationService.navigateToHome()).resolves.not.toThrow();
    });
  });
});