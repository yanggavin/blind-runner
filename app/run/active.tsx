import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, Alert, BackHandler } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { AccessibleButton } from '../../src/components/AccessibleButton';
import { MetricsDisplay } from '../../src/components/MetricsDisplay';
import { RunControls } from '../../src/components/RunControls';
import { RunTrackingServiceImpl } from '../../src/services/RunTrackingService';
import { LocationServiceImpl } from '../../src/services/LocationService';
import { TTSServiceImpl } from '../../src/services/TTSService';
import { NavigationStateManager } from '../_layout';
import { RunMetrics } from '../../src/models/types';

export default function ActiveRunScreen() {
  const [runTrackingService] = useState(() => new RunTrackingServiceImpl(new LocationServiceImpl()));
  const [ttsService] = useState(() => new TTSServiceImpl());
  const [navigationManager] = useState(() => NavigationStateManager.getInstance());
  const [metrics, setMetrics] = useState<RunMetrics | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  // Handle hardware back button on Android
  useFocusEffect(
    React.useCallback(() => {
      const onBackPress = () => {
        // Prevent going back during an active run
        if (isRunning && !isPaused) {
          Alert.alert(
            'Run in Progress',
            'You have an active run. Please pause or stop the run before navigating away.',
            [
              { text: 'OK', style: 'default' }
            ]
          );
          return true; // Prevent default back action
        }
        return false; // Allow default back action
      };

      const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => subscription.remove();
    }, [isRunning, isPaused])
  );

  useEffect(() => {
    // Check run state and load metrics
    const loadRunState = async () => {
      try {
        const running = runTrackingService.isRunning();
        const paused = runTrackingService.isPaused();
        
        setIsRunning(running);
        setIsPaused(paused);

        if (running || paused) {
          const currentMetrics = runTrackingService.getCurrentMetrics();
          setMetrics(currentMetrics);
        } else {
          // No active run, navigate back to home
          router.replace('/');
        }
      } catch (error) {
        console.error('Error loading run state:', error);
        await ttsService.speak('Error loading run data');
        router.replace('/');
      }
    };

    loadRunState();

    // Set up metrics update interval
    const metricsInterval = setInterval(() => {
      if (runTrackingService.isRunning()) {
        const currentMetrics = runTrackingService.getCurrentMetrics();
        setMetrics(currentMetrics);
      }
    }, 1000); // Update every second

    return () => {
      clearInterval(metricsInterval);
    };
  }, [runTrackingService, ttsService]);

  const handlePauseResume = async () => {
    try {
      if (isPaused) {
        await runTrackingService.resumeRun();
        setIsPaused(false);
        await ttsService.speak('Run resumed');
      } else {
        await runTrackingService.pauseRun();
        setIsPaused(true);
        await ttsService.speak('Run paused');
      }
    } catch (error) {
      console.error('Error pausing/resuming run:', error);
      await ttsService.speak('Error pausing or resuming run');
    }
  };

  const handleStopRun = async () => {
    Alert.alert(
      'Stop Run',
      'Are you sure you want to stop this run? This action cannot be undone.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Stop Run',
          style: 'destructive',
          onPress: async () => {
            try {
              const runData = await runTrackingService.stopRun();
              navigationManager.setActiveRun(null);
              
              // Announce run completion
              await ttsService.speak(
                `Run completed. Distance: ${runData.totalDistance.toFixed(2)} kilometers. ` +
                `Time: ${Math.floor(runData.totalDuration / 60)} minutes and ${runData.totalDuration % 60} seconds.`
              );
              
              // Navigate to run details
              router.replace(`/history/${runData.id}`);
            } catch (error) {
              console.error('Error stopping run:', error);
              await ttsService.speak('Error stopping run');
            }
          },
        },
      ]
    );
  };

  const handleBackToHome = () => {
    if (isRunning && !isPaused) {
      Alert.alert(
        'Run in Progress',
        'You have an active run. Please pause or stop the run before navigating away.',
        [{ text: 'OK', style: 'default' }]
      );
      return;
    }
    
    router.replace('/');
  };

  if (!metrics) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading run data...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <AccessibleButton
          title="← Back"
          onPress={handleBackToHome}
          accessibilityLabel="Back to home"
          accessibilityHint="Navigate back to home screen"
          variant="secondary"
          size="small"
          style={styles.backButton}
        />
        <Text style={styles.headerTitle}>Active Run</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.content}>
        <MetricsDisplay
          metrics={metrics}
          isRunning={isRunning}
          isPaused={isPaused}
        />

        <RunControls
          isRunning={isRunning}
          isPaused={isPaused}
          onPauseResume={handlePauseResume}
          onStop={handleStopRun}
        />

        {isPaused && (
          <View style={styles.pausedIndicator}>
            <Text style={styles.pausedText}>RUN PAUSED</Text>
            <Text style={styles.pausedSubtext}>
              Tap Resume to continue tracking
            </Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2C2C2E',
  },
  backButton: {
    minWidth: 80,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#ffffff',
    textAlign: 'center',
    flex: 1,
  },
  headerSpacer: {
    width: 80, // Same width as back button for centering
  },
  content: {
    flex: 1,
    padding: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 18,
    color: '#ffffff',
  },
  pausedIndicator: {
    backgroundColor: '#FF9500',
    borderRadius: 12,
    padding: 16,
    marginTop: 20,
    alignItems: 'center',
  },
  pausedText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#000000',
    marginBottom: 4,
  },
  pausedSubtext: {
    fontSize: 16,
    color: '#000000',
    textAlign: 'center',
  },
});