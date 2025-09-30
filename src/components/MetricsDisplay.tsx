import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ViewStyle,
  TextStyle,
  AccessibilityInfo,
} from 'react-native';

interface MetricItem {
  label: string;
  value: string;
  unit?: string;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  isLiveRegion?: boolean;
}

interface MetricsDisplayProps {
  metrics: MetricItem[];
  style?: ViewStyle;
  itemStyle?: ViewStyle;
  labelStyle?: TextStyle;
  valueStyle?: TextStyle;
  unitStyle?: TextStyle;
  layout?: 'horizontal' | 'vertical' | 'grid';
  testID?: string;
  accessibilityLabel?: string;
}

export const MetricsDisplay: React.FC<MetricsDisplayProps> = ({
  metrics,
  style,
  itemStyle,
  labelStyle,
  valueStyle,
  unitStyle,
  layout = 'vertical',
  testID,
  accessibilityLabel,
}) => {
  const previousMetricsRef = useRef<MetricItem[]>([]);
  
  // Announce significant metric changes for accessibility
  useEffect(() => {
    const previousMetrics = previousMetricsRef.current;
    
    if (previousMetrics.length > 0) {
      metrics.forEach((metric, index) => {
        const previousMetric = previousMetrics[index];
        if (previousMetric && metric.isLiveRegion && metric.value !== previousMetric.value) {
          const announcement = metric.accessibilityLabel || 
            `${metric.label}: ${metric.value}${metric.unit ? ` ${metric.unit}` : ''}`;
          AccessibilityInfo.announceForAccessibility(announcement);
        }
      });
    }
    
    previousMetricsRef.current = [...metrics];
  }, [metrics]);

  const containerStyles = [
    styles.container,
    styles[`${layout}Container`],
    style,
  ];

  const renderMetric = (metric: MetricItem, index: number) => {
    const metricAccessibilityLabel = metric.accessibilityLabel || 
      `${metric.label}: ${metric.value}${metric.unit ? ` ${metric.unit}` : ''}`;

    return (
      <View
        key={index}
        style={[styles.metricItem, itemStyle]}
        accessible={true}
        accessibilityLabel={metricAccessibilityLabel}
        accessibilityHint={metric.accessibilityHint}
        accessibilityRole="text"
        accessibilityLiveRegion={metric.isLiveRegion ? 'polite' : 'none'}
        testID={`metric-${index}`}
      >
        <Text 
          style={[styles.label, labelStyle]}
          accessible={false}
          allowFontScaling={true}
        >
          {metric.label}
        </Text>
        <View style={styles.valueContainer}>
          <Text 
            style={[styles.value, valueStyle]}
            accessible={false}
            allowFontScaling={true}
          >
            {metric.value}
          </Text>
          {metric.unit && (
            <Text 
              style={[styles.unit, unitStyle]}
              accessible={false}
              allowFontScaling={true}
            >
              {metric.unit}
            </Text>
          )}
        </View>
      </View>
    );
  };

  return (
    <View 
      style={containerStyles}
      accessible={false} // Let individual metrics handle accessibility
      testID={testID}
      accessibilityLabel={accessibilityLabel}
    >
      {metrics.map(renderMetric)}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 16,
  },
  
  // Layout styles
  verticalContainer: {
    flexDirection: 'column',
  },
  horizontalContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  
  // Metric item styles - Enhanced for accessibility
  metricItem: {
    alignItems: 'center',
    marginVertical: 12,
    minHeight: 80, // Larger touch target for accessibility
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  
  // Text styles - High contrast and accessibility optimized
  label: {
    fontSize: 18, // Larger for better readability
    fontWeight: '600',
    color: '#495057', // Higher contrast
    marginBottom: 8,
    textAlign: 'center',
  },
  
  valueContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  
  value: {
    fontSize: 36, // Larger for better visibility
    fontWeight: '700',
    color: '#212529', // Maximum contrast
    textAlign: 'center',
    lineHeight: 42,
  },
  
  unit: {
    fontSize: 20, // Larger for better readability
    fontWeight: '500',
    color: '#495057', // Higher contrast
    marginLeft: 6,
  },
});