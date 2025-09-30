import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, Alert } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { AccessibleButton } from '../../src/components/AccessibleButton';
import { DatabaseService } from '../../src/database/DatabaseService';
import { TTSServiceImpl } from '../../src/services/TTSService';
import { RunData } from '../../src/models/types';

export default function RunDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [runData, setRunData] = useState<RunData | null>(null);
  const [loading, setLoading] = useState(true);
  const [ttsService] = useState(() => new TTSServiceImpl());

  useEffect(() => {
    loadRunData();
  }, [id]);

  const loadRunData = async () => {
    if (!id) {
      Alert.alert('Error', 'Invalid run ID');
      router.back();
      return;
    }

    try {
      const db = await DatabaseService.getInstance();
      const run = await db.getRunById(parseInt(id));
      
      if (!run) {
        Alert.alert('Error', 'Run not found');
        router.back();
        return;
      }

      setRunData(run);
    } catch (error) {
      console.error('Error loading run data:', error);
      Alert.alert('Error', 'Failed to load run data');
      await ttsService.speak('Failed to load run data');
    } finally {
      setLoading(false);
    }
  };

  const handlePlaySummary = async () => {
    if (!runData) return;

    const summary = `Run summary: Distance ${runData.totalDistance.toFixed(2)} kilometers. ` +
      `Duration ${Math.floor(runData.totalDuration / 60)} minutes and ${runData.totalDuration % 60} seconds. ` +
      `Average pace ${runData.averagePace.toFixed(2)} minutes per kilometer. ` +
      `Completed on ${new Date(runData.startTime).toLocaleDateString()}.`;

    await ttsService.speak(summary);
  };

  const handleShare = async () => {
    // TODO: Implement sharing functionality
    await ttsService.speak('Sharing functionality coming soon');
  };

  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const formatPace = (pace: number): string => {
    const minutes = Math.floor(pace);
    const seconds = Math.round((pace - minutes) * 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading run details...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!runData) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Run not found</Text>
          <AccessibleButton
            title="Go Back"
            onPress={() => router.back()}
            accessibilityLabel="Go back to previous screen"
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <AccessibleButton
          title="← Back"
          onPress={() => router.back()}
          accessibilityLabel="Back to history"
          accessibilityHint="Navigate back to run history"
          variant="secondary"
          size="small"
          style={styles.backButton}
        />
        <Text style={styles.headerTitle}>Run Details</Text>
        <AccessibleButton
          title="Share"
          onPress={handleShare}
          accessibilityLabel="Share run data"
          accessibilityHint="Share this run with other apps"
          variant="secondary"
          size="small"
          style={styles.shareButton}
        />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.scrollContent}>
        {/* Run Summary */}
        <View style={styles.summarySection}>
          <Text style={styles.sectionTitle}>Run Summary</Text>
          <Text style={styles.runDate}>
            {new Date(runData.startTime).toLocaleDateString('en-US', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </Text>
          <Text style={styles.runTime}>
            Started at {new Date(runData.startTime).toLocaleTimeString('en-US', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </Text>
        </View>

        {/* Key Metrics */}
        <View style={styles.metricsSection}>
          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>{runData.totalDistance.toFixed(2)}</Text>
            <Text style={styles.metricLabel}>Kilometers</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>{formatDuration(runData.totalDuration)}</Text>
            <Text style={styles.metricLabel}>Duration</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>{formatPace(runData.averagePace)}</Text>
            <Text style={styles.metricLabel}>Avg Pace /km</Text>
          </View>
        </View>

        {/* Splits */}
        {runData.splits && runData.splits.length > 0 && (
          <View style={styles.splitsSection}>
            <Text style={styles.sectionTitle}>Splits</Text>
            {runData.splits.map((split, index) => (
              <View key={split.id} style={styles.splitRow}>
                <Text style={styles.splitNumber}>KM {split.splitNumber}</Text>
                <Text style={styles.splitTime}>{formatDuration(split.duration)}</Text>
                <Text style={styles.splitPace}>{formatPace(split.pace)}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Actions */}
        <View style={styles.actionsSection}>
          <AccessibleButton
            title="🔊 Play Summary"
            onPress={handlePlaySummary}
            accessibilityLabel="Play run summary"
            accessibilityHint="Listen to a spoken summary of this run"
            style={styles.actionButton}
          />
        </View>
      </ScrollView>
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
  shareButton: {
    minWidth: 80,
  },
  content: {
    flex: 1,
  },
  scrollContent: {
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
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 18,
    color: '#ff6b6b',
    marginBottom: 20,
    textAlign: 'center',
  },
  summarySection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 12,
  },
  runDate: {
    fontSize: 18,
    color: '#ffffff',
    marginBottom: 4,
  },
  runTime: {
    fontSize: 16,
    color: '#cccccc',
  },
  metricsSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  metricCard: {
    flex: 1,
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 4,
    alignItems: 'center',
  },
  metricValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#007AFF',
    marginBottom: 4,
  },
  metricLabel: {
    fontSize: 14,
    color: '#cccccc',
    textAlign: 'center',
  },
  splitsSection: {
    marginBottom: 24,
  },
  splitRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1C1C1E',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  splitNumber: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
    flex: 1,
  },
  splitTime: {
    fontSize: 16,
    color: '#ffffff',
    flex: 1,
    textAlign: 'center',
  },
  splitPace: {
    fontSize: 16,
    color: '#007AFF',
    flex: 1,
    textAlign: 'right',
  },
  actionsSection: {
    marginTop: 16,
  },
  actionButton: {
    marginBottom: 12,
  },
});