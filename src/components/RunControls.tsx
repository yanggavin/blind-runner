import React, { useEffect } from 'react';
import {
  View,
  StyleSheet,
  ViewStyle,
  AccessibilityInfo,
} from 'react-native';
import { AccessibleButton } from './AccessibleButton';

export interface RunControlsProps {
  runState: 'idle' | 'running' | 'paused';
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onSOS?: () => void;
  style?: ViewStyle;
  disabled?: boolean;
}

export const RunControls: React.FC<RunControlsProps> = ({
  runState,
  onStart,
  onPause,
  onResume,
  onStop,
  onSOS,
  style,
  disabled = false,
}) => {
  // Announce run state changes for accessibility
  useEffect(() => {
    let announcement = '';
    switch (runState) {
      case 'running':
        announcement = 'Run is active. Pause button available.';
        break;
      case 'paused':
        announcement = 'Run is paused. Resume or stop buttons available.';
        break;
      case 'idle':
        announcement = 'Ready to start a new run.';
        break;
    }
    
    if (announcement) {
      // Delay announcement to avoid conflicts with other accessibility announcements
      setTimeout(() => {
        AccessibilityInfo.announceForAccessibility(announcement);
      }, 500);
    }
  }, [runState]);
  const renderPrimaryButton = () => {
    switch (runState) {
      case 'idle':
        return (
          <AccessibleButton
            title="Start Run"
            onPress={onStart}
            variant="primary"
            size="large"
            disabled={disabled}
            accessibilityLabel="Start Run"
            accessibilityHint="Double tap to begin tracking your run"
            accessibilityRole="button"
            style={styles.primaryButton}
          />
        );
      case 'running':
        return (
          <AccessibleButton
            title="Pause"
            onPress={onPause}
            variant="primary"
            size="large"
            disabled={disabled}
            accessibilityLabel="Pause Run"
            accessibilityHint="Double tap to pause your current run"
            accessibilityRole="button"
            style={styles.primaryButton}
          />
        );
      case 'paused':
        return (
          <AccessibleButton
            title="Resume"
            onPress={onResume}
            variant="primary"
            size="large"
            disabled={disabled}
            accessibilityLabel="Resume Run"
            accessibilityHint="Double tap to resume your paused run"
            accessibilityRole="button"
            style={styles.primaryButton}
          />
        );
      default:
        return null;
    }
  };

  const renderSecondaryButtons = () => {
    if (runState === 'idle') {
      return (
        <View style={styles.secondaryButtonsContainer}>
          {onSOS && (
            <AccessibleButton
              title="Emergency SOS"
              onPress={onSOS}
              variant="secondary"
              size="medium"
              disabled={disabled}
              accessibilityLabel="Emergency SOS"
              accessibilityHint="Double tap to send emergency message to your contacts"
              accessibilityRole="button"
              style={styles.sosButton}
            />
          )}
        </View>
      );
    }

    if (runState === 'running' || runState === 'paused') {
      return (
        <View style={styles.secondaryButtonsContainer}>
          <AccessibleButton
            title="Stop Run"
            onPress={onStop}
            variant="secondary"
            size="medium"
            disabled={disabled}
            accessibilityLabel="Stop Run"
            accessibilityHint="Double tap to end your current run and save the data"
            accessibilityRole="button"
            style={styles.stopButton}
          />
          {onSOS && (
            <AccessibleButton
              title="Emergency SOS"
              onPress={onSOS}
              variant="secondary"
              size="medium"
              disabled={disabled}
              accessibilityLabel="Emergency SOS"
              accessibilityHint="Double tap to send emergency message to your contacts"
              accessibilityRole="button"
              style={styles.sosButton}
            />
          )}
        </View>
      );
    }

    return null;
  };

  return (
    <View 
      style={[styles.container, style]}
      accessible={false} // Let individual buttons handle accessibility
      accessibilityLabel={`Run controls. Current state: ${runState}`}
    >
      <View 
        style={styles.primaryButtonContainer}
        accessibilityRole="group"
        accessibilityLabel="Primary run control"
      >
        {renderPrimaryButton()}
      </View>
      {renderSecondaryButtons() && (
        <View 
          style={styles.secondaryButtonsContainer}
          accessibilityRole="group"
          accessibilityLabel="Secondary run controls"
        >
          {renderSecondaryButtons()}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 16,
  },
  
  primaryButtonContainer: {
    width: '100%',
    marginBottom: 24,
  },
  
  primaryButton: {
    width: '100%',
    minHeight: 96,
  },
  
  secondaryButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    gap: 16,
  },
  
  stopButton: {
    flex: 1,
    backgroundColor: '#dc3545',
    borderColor: '#dc3545',
  },
  
  sosButton: {
    flex: 1,
    backgroundColor: '#fd7e14',
    borderColor: '#fd7e14',
  },
});