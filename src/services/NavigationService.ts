import { router } from 'expo-router';
import { Linking, Platform } from 'react-native';
import { TTSServiceImpl } from './TTSService';

export interface DeepLinkConfig {
  scheme: string;
  host?: string;
  path?: string;
  queryParams?: Record<string, string>;
}

export class NavigationService {
  private static instance: NavigationService;
  private ttsService: TTSServiceImpl;
  private navigationHistory: string[] = [];

  private constructor() {
    this.ttsService = new TTSServiceImpl();
    this.setupDeepLinking();
  }

  static getInstance(): NavigationService {
    if (!NavigationService.instance) {
      NavigationService.instance = new NavigationService();
    }
    return NavigationService.instance;
  }

  private setupDeepLinking() {
    // Handle initial URL if app was opened via deep link
    Linking.getInitialURL().then((url) => {
      if (url) {
        this.handleDeepLink(url);
      }
    });

    // Handle deep links when app is already running
    const subscription = Linking.addEventListener('url', (event) => {
      this.handleDeepLink(event.url);
    });

    return () => {
      subscription?.remove();
    };
  }

  private async handleDeepLink(url: string) {
    try {
      const parsedUrl = new URL(url);
      const path = parsedUrl.pathname;
      const params = Object.fromEntries(parsedUrl.searchParams);

      console.log('Handling deep link:', { path, params });

      // Route based on path
      switch (path) {
        case '/':
        case '/home':
          try {
            router.push('/');
            await this.announceNavigation('Home');
          } catch (error) {
            console.error('Error navigating via deep link to home:', error);
          }
          break;

        case '/history':
          try {
            router.push('/history');
            await this.announceNavigation('Run History');
          } catch (error) {
            console.error('Error navigating via deep link to history:', error);
          }
          break;

        case '/settings':
          try {
            router.push('/settings');
            await this.announceNavigation('Settings');
          } catch (error) {
            console.error('Error navigating via deep link to settings:', error);
          }
          break;

        case '/run/active':
          try {
            router.push('/run/active');
            await this.announceNavigation('Active Run');
          } catch (error) {
            console.error('Error navigating via deep link to active run:', error);
          }
          break;

        default:
          // Handle dynamic routes like /history/[id]
          if (path.startsWith('/history/')) {
            const runId = path.split('/')[2];
            if (runId && !isNaN(parseInt(runId))) {
              try {
                router.push(`/history/${runId}`);
                await this.announceNavigation('Run Details');
              } catch (error) {
                console.error('Error navigating via deep link to run detail:', error);
              }
            } else {
              this.handleInvalidLink();
            }
          } else {
            this.handleInvalidLink();
          }
          break;
      }
    } catch (error) {
      console.error('Error handling deep link:', error);
      this.handleInvalidLink();
    }
  }

  private async handleInvalidLink() {
    try {
      console.warn('Invalid deep link, navigating to home');
      router.push('/');
      await this.ttsService.speak('Invalid link. Navigated to home screen.');
    } catch (error) {
      console.error('Error handling invalid link:', error);
    }
  }

  async navigateToHome() {
    try {
      router.push('/');
      this.addToHistory('/');
      await this.announceNavigation('Home');
    } catch (error) {
      console.error('Error navigating to home:', error);
    }
  }

  async navigateToHistory() {
    try {
      router.push('/history');
      this.addToHistory('/history');
      await this.announceNavigation('Run History');
    } catch (error) {
      console.error('Error navigating to history:', error);
    }
  }

  async navigateToSettings() {
    try {
      router.push('/settings');
      this.addToHistory('/settings');
      await this.announceNavigation('Settings');
    } catch (error) {
      console.error('Error navigating to settings:', error);
    }
  }

  async navigateToActiveRun() {
    try {
      router.push('/run/active');
      this.addToHistory('/run/active');
      await this.announceNavigation('Active Run');
    } catch (error) {
      console.error('Error navigating to active run:', error);
    }
  }

  async navigateToRunDetail(runId: number) {
    try {
      const path = `/history/${runId}`;
      router.push(path);
      this.addToHistory(path);
      await this.announceNavigation('Run Details');
    } catch (error) {
      console.error('Error navigating to run detail:', error);
    }
  }

  async goBack() {
    try {
      if (this.navigationHistory.length > 1) {
        // Remove current page
        this.navigationHistory.pop();
        // Get previous page
        const previousPath = this.navigationHistory[this.navigationHistory.length - 1];
        router.push(previousPath);
        await this.announceNavigation(this.getScreenNameFromPath(previousPath));
      } else {
        // No history, go to home
        await this.navigateToHome();
      }
    } catch (error) {
      console.error('Error going back:', error);
    }
  }

  private addToHistory(path: string) {
    // Avoid duplicate consecutive entries
    if (this.navigationHistory[this.navigationHistory.length - 1] !== path) {
      this.navigationHistory.push(path);
      
      // Keep history manageable (max 10 entries)
      if (this.navigationHistory.length > 10) {
        this.navigationHistory.shift();
      }
    }
  }

  private getScreenNameFromPath(path: string): string {
    if (path === '/' || path === '/home') return 'Home';
    if (path === '/history') return 'Run History';
    if (path === '/settings') return 'Settings';
    if (path === '/run/active') return 'Active Run';
    if (path.startsWith('/history/')) return 'Run Details';
    return 'Unknown Screen';
  }

  private async announceNavigation(screenName: string) {
    try {
      await this.ttsService.speak(`Navigated to ${screenName}`);
    } catch (error) {
      console.error('Error announcing navigation:', error);
    }
  }

  // Generate shareable deep links
  generateRunDetailLink(runId: number): string {
    const baseUrl = this.getBaseUrl();
    return `${baseUrl}/history/${runId}`;
  }

  generateSettingsLink(): string {
    const baseUrl = this.getBaseUrl();
    return `${baseUrl}/settings`;
  }

  private getBaseUrl(): string {
    // In production, this would be your app's custom scheme
    // For development, using expo scheme
    if (Platform.OS === 'web') {
      return window.location.origin;
    }
    return 'blindrunner://'; // Custom scheme for the app
  }

  // Share functionality
  async shareRunDetail(runId: number) {
    try {
      const url = this.generateRunDetailLink(runId);
      
      if (Platform.OS === 'web') {
        // Web sharing
        if (navigator.share) {
          await navigator.share({
            title: 'My Run Details',
            text: 'Check out my run details',
            url: url,
          });
        } else {
          // Fallback: copy to clipboard
          await navigator.clipboard.writeText(url);
          await this.ttsService.speak('Link copied to clipboard');
        }
      } else {
        // Mobile sharing - will be implemented with React Native Share
        const { Share } = await import('react-native');
        await Share.share({
          message: `Check out my run details: ${url}`,
          url: url,
        });
      }
    } catch (error) {
      console.error('Error sharing run detail:', error);
      await this.ttsService.speak('Error sharing run details');
    }
  }

  // Navigation state management
  getCurrentPath(): string {
    return this.navigationHistory[this.navigationHistory.length - 1] || '/';
  }

  getNavigationHistory(): string[] {
    return [...this.navigationHistory];
  }

  clearHistory() {
    this.navigationHistory = [];
  }
}

export default NavigationService;