import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ViewStyle,
  TextStyle,
  AccessibilityRole,
  AccessibilityState,
  AccessibilityInfo,
} from 'react-native';
import { HapticServiceImpl } from '../services';

interface AccessibleButtonProps {
  title: string;
  onPress: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityRole?: AccessibilityRole;
  accessibilityState?: AccessibilityState;
  style?: ViewStyle;
  textStyle?: TextStyle;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'danger' | 'warning';
  size?: 'small' | 'medium' | 'large';
  testID?: string;
}

export const AccessibleButton: React.FC<AccessibleButtonProps> = ({
  title,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  accessibilityRole = 'button',
  accessibilityState,
  style,
  textStyle,
  disabled = false,
  variant = 'primary',
  size = 'medium',
  testID,
}) => {
  const hapticService = new HapticServiceImpl();

  const handlePress = async () => {
    if (disabled) return;
    
    // Provide haptic feedback for accessibility
    await hapticService.buttonPress();
    
    // Announce button press for screen readers if needed
    if (accessibilityLabel && accessibilityLabel !== title) {
      AccessibilityInfo.announceForAccessibility(`${accessibilityLabel} activated`);
    }
    
    onPress();
  };

  const buttonStyles = [
    styles.button,
    styles[`${variant}Button`],
    styles[`${size}Button`],
    disabled && styles.disabledButton,
    style,
  ];

  const textStyles = [
    styles.text,
    styles[`${variant}Text`],
    styles[`${size}Text`],
    disabled && styles.disabledText,
    textStyle,
  ];

  return (
    <TouchableOpacity
      style={buttonStyles}
      onPress={handlePress}
      disabled={disabled}
      accessible={true}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel || title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled, ...accessibilityState }}
      testID={testID}
      activeOpacity={0.7}
    >
      <Text 
        style={textStyles}
        accessible={false} // Let parent handle accessibility
        allowFontScaling={true}
      >
        {title}
      </Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 64, // Exceeds WCAG 2.1 AA minimum of 44dp for better accessibility
    minWidth: 64,
  },
  
  // Variant styles - High contrast colors for accessibility
  primaryButton: {
    backgroundColor: '#0066cc', // Higher contrast blue
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    borderWidth: 3, // Thicker border for better visibility
    borderColor: '#0066cc',
  },
  dangerButton: {
    backgroundColor: '#cc0000', // High contrast red
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  warningButton: {
    backgroundColor: '#cc6600', // High contrast orange
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  
  // Size styles
  smallButton: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 56,
  },
  mediumButton: {
    paddingHorizontal: 24,
    paddingVertical: 16,
    minHeight: 64,
  },
  largeButton: {
    paddingHorizontal: 32,
    paddingVertical: 24,
    minHeight: 96,
  },
  
  // Disabled styles
  disabledButton: {
    opacity: 0.5,
  },
  
  // Text styles
  text: {
    fontWeight: '700',
    textAlign: 'center',
  },
  
  // Variant text styles - High contrast for accessibility
  primaryText: {
    color: '#ffffff',
  },
  secondaryText: {
    color: '#0066cc',
  },
  dangerText: {
    color: '#ffffff',
  },
  warningText: {
    color: '#ffffff',
  },
  
  // Size text styles
  smallText: {
    fontSize: 16,
  },
  mediumText: {
    fontSize: 18,
  },
  largeText: {
    fontSize: 24,
  },
  
  // Disabled text
  disabledText: {
    opacity: 0.7,
  },
});