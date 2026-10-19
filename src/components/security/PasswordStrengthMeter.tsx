import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, ProgressBar } from 'react-native-paper';
import { theme } from '../../constants/theme';
import zxcvbn from 'zxcvbn';

interface PasswordStrengthMeterProps {
  password: string;
}

export function PasswordStrengthMeter({ password }: PasswordStrengthMeterProps) {
  const result = zxcvbn(password);
  const score = result.score; // 0-4

  const getStrengthColor = (score: number) => {
    switch (score) {
      case 0:
        return theme.colors.error;
      case 1:
        return theme.colors.error;
      case 2:
        return theme.colors.warning;
      case 3:
        return theme.colors.primary;
      case 4:
        return theme.colors.success;
      default:
        return theme.colors.error;
    }
  };

  const getStrengthLabel = (score: number) => {
    switch (score) {
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
        return 'Muito fraca';
    }
  };

  const getFeedback = () => {
    if (!password) return '';
    
    const feedback = result.feedback.suggestions.join(' ');
    return feedback || result.feedback.warning || '';
  };

  return (
    <View style={styles.container}>
      <View style={styles.labelContainer}>
        <Text variant="bodySmall">Força da senha: </Text>
        <Text
          variant="bodySmall"
          style={{ color: getStrengthColor(score) }}
        >
          {getStrengthLabel(score)}
        </Text>
      </View>
      
      <ProgressBar
        progress={(score + 1) / 5}
        color={getStrengthColor(score)}
        style={styles.progressBar}
      />
      
      {getFeedback() ? (
        <Text variant="bodySmall" style={styles.feedback}>
          {getFeedback()}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  labelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  progressBar: {
    height: 4,
    borderRadius: 2,
  },
  feedback: {
    marginTop: 4,
    color: theme.colors.error,
  },
}); 