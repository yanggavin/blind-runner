import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  Alert,
  useColorScheme,
} from 'react-native';
import { router } from 'expo-router';
import { AccessibleButton } from '../../src/components';
import { 
  RunTrackingServiceImpl, 
  LocationServiceImpl, 
  TTSServiceImpl 
} from '../../src/services';

export default function HomeScreen() {
  const [isStartingRun, setIsStartingRun] = useState(false);
  const [runTrackingService] = useState(() => new RunTrackingServiceImpl(new LocationServiceImpl()));
  const [ttsService] = useState(() => new TTSServiceImpl());
  const colorScheme = useColorScheme();
  
  const isDark = colorScheme === 'dark';

  useEffect(() => {
    // Check if there's an active run when the component mounts
    checkForActiveRun();
  }, []);

  const checkForActiveRun = async () => {
    try {
      const hasActiveRun = await runTrackingService.restoreActiveRun();
      if (hasActiveRun) {
        // Navigate to active run screen if there's an ongoing run
        router.push('/run/active');
      }
    } catch (error) {
      console.error('Error checking for active run:', error);
    }
  };

  const handleStartRun = async () => {
    if (isStartingRun) return;

    setIsStartingRun(true);

    try {
      // Request location permissions and start the run
      await runTrackingService.startRun();
      
      // Announce run start
      await ttsService.announceRunStart();
      
      // Navigate to active run screen
      router.push('/run/active');
    } catch (error) {
      console.error('Error starting run:', error);
      
      // Show accessible error message
      Alert.alert(
        'Unable to Start Run',
        'Please ensure location permissions are granted and GPS is enabled.',
        [
          {
            text: 'OK',
            onPress: () => {
              // Announce error via TTS
              ttsService.speak('Unable to start run. Please check location permissions and GPS.');
            }
          }
        ]
      );
    } finally {
      setIsStartingRun(false);
    }
  };

  const handleSettingsPress = () => {
    router.push('/(tabs)/settings');
  };

  const dynamicStyles = {
    container: {
      backgroundColor: isDark ? '#101c22' : '#f5f7f8',
    },
    headerText: {
      color: isDark ? '#f5f7f8' : '#101c22',
    },
    settingsButton: {
      backgroundColor: isDark ? '#f5f7f8' : '#101c22',
    },
    settingsButtonText: {
      color: isDark ? '#101c22' : '#f5f7f8',
    },
  };

  return (
    <SafeAreaView style={[styles.safeArea, dynamicStyles.container]}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerSpacer} />
          <Text 
            style={[styles.headerTitle, dynamicStyles.headerText]}
            accessible={true}
            accessibilityRole="header"
            accessibilityLabel="Run Tracker"
          >
            Run Tracker
          </Text>
          <AccessibleButton
            title="⚙️"
            onPress={handleSettingsPress}
            accessibilityLabel="Settings"
            accessibilityHint="Navigate to settings screen"
            style={StyleSheet.flatten([styles.settingsButton, dynamicStyles.settingsButton])}
            textStyle={StyleSheet.flatten([styles.settingsButtonText, dynamicStyles.settingsButtonText])}
            variant="secondary"
            size="small"
          />
        </View>

        {/* Main Content */}
        <View style={styles.main}>
          <AccessibleButton
            title={isStartingRun ? "Starting..." : "Start Run"}
            onPress={handleStartRun}
            disabled={isStartingRun}
            accessibilityLabel={isStartingRun ? "Starting run, please wait" : "Start Run"}
            accessibilityHint="Tap to begin GPS tracking and start your run"
            style={styles.startButton}
            textStyle={styles.startButtonText}
            variant="primary"
            size="large"
          />
        </View>

        {/* Instructions for screen reader users */}
        <View style={styles.instructions}>
          <Text 
            style={[styles.instructionText, dynamicStyles.headerText]}
            accessible={true}
            accessibilityRole="text"
          >
            Tap the Start Run button to begin tracking your run with GPS and voice announcements.
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
    paddingHorizontal: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingBottom: 8,
  },
  headerSpacer: {
    width: 48, // Same width as settings button for centering
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    flex: 1,
  },
  settingsButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 0,
  },
  settingsButtonText: {
    fontSize: 24,
  },
  main: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 32,
  },
  startButton: {
    width: '100%',
    height: 96,
    borderRadius: 12,
  },
  startButtonText: {
    fontSize: 28,
    fontWeight: '700',
  },
  instructions: {
    paddingVertical: 16,
    paddingHorizontal: 8,
  },
  instructionText: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
    opacity: 0.8,
  },
});