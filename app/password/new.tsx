import React from 'react';
import { View, StyleSheet } from 'react-native';
import { PasswordForm } from '../../src/components/PasswordForm';

export default function NewPasswordScreen() {
  return (
    <View style={styles.container}>
      <PasswordForm mode="create" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
}); 