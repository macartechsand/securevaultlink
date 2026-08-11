import React from 'react';
import { View, StyleSheet } from 'react-native';
import { FAB } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { PasswordList } from '../../src/components/PasswordList';

export default function PasswordsScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <PasswordList />
      <FAB
        icon="plus"
        style={styles.fab}
        onPress={() => router.push('/password/new')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  fab: {
    position: 'absolute',
    margin: 16,
    right: 0,
    bottom: 0,
  },
}); 