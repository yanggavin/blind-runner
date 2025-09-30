import { Tabs, useRouter, useSegments } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Platform, AccessibilityInfo } from 'react-native';
import { ServiceIntegrationManager } from '../src/services/ServiceIntegrationManager';

// Navigation state management using integrated services
class NavigationStateManager {
  private static instance: NavigationStateManager;
  private serviceManager: ServiceIntegrationManager;

  private constructor() {
    this.serviceManager = ServiceIntegrationManager.getInstance();
  }

  static getInstance(): NavigationStateManager {
    if (!NavigationStateManager.instance) {
      NavigationStateManager.instance = new NavigationStateManager();
    }
    return NavigationStateManager.instance;
  }

  async initialize(): Promise<void> {
    await this.serviceManager.initialize();
  }

  setActiveRun(runId: number | null) {
    // Active run state is managed by ServiceIntegrationManager
  }

  getActiveRun(): number | null {
    return this.serviceManager.isRunActive() ? 1 : null; // Simplified for navigation
  }

  async checkForActiveRun(): Promise<boolean> {
    try {
      return this.serviceManager.isRunActive();
    } catch (error) {
      console.error('Error checking for active run:', error);
      return false;
    }
  }

  async announceScreenTransition(screenName: string) {
    try {
      await this.serviceManager.services.tts.speak(`Navigated to ${screenName} screen`);
    } catch (error) {
      console.error('Error announcing screen transition:', error);
    }
  }
}

export default function TabLayout() {
  const router = useRouter();
  const segments = useSegments();
  const [navigationManager] = useState(() => NavigationStateManager.getInstance());
  const [isScreenReaderEnabled, setIsScreenReaderEnabled] = useState(false);

  useEffect(() => {
    // Check if screen reader is enabled
    const checkScreenReader = async () => {
      try {
        const enabled = await AccessibilityInfo.isScreenReaderEnabled();
        setIsScreenReaderEnabled(enabled);
      } catch (error) {
        console.error('Error checking screen reader status:', error);
      }
    };

    checkScreenReader();

    // Listen for screen reader changes
    const subscription = AccessibilityInfo.addEventListener(
      'screenReaderChanged',
      setIsScreenReaderEnabled
    );

    return () => {
      subscription?.remove();
    };
  }, []);

  useEffect(() => {
    // Announce screen transitions for accessibility
    if (isScreenReaderEnabled && segments.length > 0) {
      const currentScreen = segments[segments.length - 1];
      let screenName = '';

      switch (currentScreen) {
        case 'index':
          screenName = 'Home';
          break;
        case 'history':
          screenName = 'Run History';
          break;
        case 'settings':
          screenName = 'Settings';
          break;
        case 'active':
          screenName = 'Active Run';
          break;
        default:
          if (currentScreen && currentScreen.match(/^\d+$/)) {
            screenName = 'Run Details';
          } else {
            screenName = currentScreen || 'Unknown';
          }
      }

      if (screenName) {
        navigationManager.announceScreenTransition(screenName);
      }
    }
  }, [segments, isScreenReaderEnabled, navigationManager]);

  useEffect(() => {
    // Initialize services and check for active run on app start
    const initializeApp = async () => {
      try {
        await navigationManager.initialize();
        const hasActiveRun = await navigationManager.checkForActiveRun();
        if (hasActiveRun && segments[0] !== 'run') {
          // Navigate to active run screen if there's an ongoing run
          router.replace('/run/active');
        }
      } catch (error) {
        console.error('Error initializing app on startup:', error);
      }
    };

    initializeApp();
  }, []);

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#007AFF',
        tabBarInactiveTintColor: '#8E8E93',
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#000000',
          borderTopColor: '#2C2C2E',
          height: Platform.OS === 'ios' ? 90 : 70,
          paddingBottom: Platform.OS === 'ios' ? 30 : 10,
          paddingTop: 10,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
        },
        tabBarAccessibilityLabel: 'Navigation tabs',
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, focused }) => null, // Will add icons later
          tabBarAccessibilityLabel: 'Home tab',
          tabBarAccessibilityHint: 'Navigate to home screen to start a new run',
          href: '/',
        }}
        listeners={{
          tabPress: () => {
            if (isScreenReaderEnabled) {
              navigationManager.announceScreenTransition('Home');
            }
          },
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: 'History',
          tabBarIcon: ({ color, focused }) => null, // Will add icons later
          tabBarAccessibilityLabel: 'History tab',
          tabBarAccessibilityHint: 'Navigate to run history to view past runs',
          href: '/history',
        }}
        listeners={{
          tabPress: () => {
            if (isScreenReaderEnabled) {
              navigationManager.announceScreenTransition('Run History');
            }
          },
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, focused }) => null, // Will add icons later
          tabBarAccessibilityLabel: 'Settings tab',
          tabBarAccessibilityHint: 'Navigate to settings to configure app preferences',
          href: '/settings',
        }}
        listeners={{
          tabPress: () => {
            if (isScreenReaderEnabled) {
              navigationManager.announceScreenTransition('Settings');
            }
          },
        }}
      />
    </Tabs>
  );
}

// Export the navigation state manager for use in other components
export { NavigationStateManager };