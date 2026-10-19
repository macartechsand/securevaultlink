import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import Animated, { 
  useAnimatedStyle, 
  withSpring,
  withTiming
} from 'react-native-reanimated';
import { PasswordStrengthResult } from '../utils/passwordStrength';

interface PasswordStrengthMeterProps {
  strength: PasswordStrengthResult;
}

export const PasswordStrengthMeter: React.FC<PasswordStrengthMeterProps> = ({ strength }) => {
  const progressStyle = useAnimatedStyle(() => {
    return {
      width: withSpring(`${(strength.score / 4) * 100}%`),
      backgroundColor: withTiming(strength.color),
    };
  });

  const getStrengthLabel = () => {
    switch (strength.score) {
      case 0:
        return 'Muito fraca';
      case 1:
        return 'Fraca';
      case 2:
        return 'Média';
      case 3:
        return 'Forte';
      case 4:
        return 'Muito forte';
      default:
        return '';
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.labelContainer}>
        <Text variant="bodySmall">Força da senha: </Text>
        <Text 
          variant="bodySmall" 
          style={{ color: strength.color }}
        >
          {getStrengthLabel()}
        </Text>
      </View>

      <View style={styles.meterContainer}>
        <Animated.View style={[styles.meterFill, progressStyle]} />
      </View>

      {strength.feedback.length > 0 && (
        <View style={styles.feedbackContainer}>
          {strength.feedback.map((feedback, index) => (
            <Text 
              key={index} 
              variant="bodySmall" 
              style={styles.feedbackText}
            >
              • {feedback}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  labelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  meterContainer: {
    height: 4,
    backgroundColor: '#e0e0e0',
    borderRadius: 2,
    overflow: 'hidden',
  },
  meterFill: {
    height: '100%',
    borderRadius: 2,
  },
  feedbackContainer: {
    marginTop: 8,
  },
  feedbackText: {
    color: '#666',
    marginBottom: 2,
  },
}); 