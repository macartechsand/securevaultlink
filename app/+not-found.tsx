import React from 'react';
import { Link, Stack, router } from 'expo-router';
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import Colors from '@/constants/Colors';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ 
        title: 'Página não encontrada',
        headerStyle: {
          backgroundColor: Colors.background,
        },
        headerTintColor: Colors.text,
        headerTitleStyle: {
          fontFamily: 'PlusJakartaSans-SemiBold',
        },
      }} />
      <View style={styles.container}>
        <Text style={styles.title}>Oops!</Text>
        <Text style={styles.text}>Esta página não existe.</Text>
        <TouchableOpacity 
          style={styles.button}
          onPress={() => router.replace('/(tabs)/passwords')}
        >
          <Text style={styles.buttonText}>Voltar para o início</Text>
        </TouchableOpacity>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    backgroundColor: Colors.background,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 8,
    fontFamily: 'PlusJakartaSans-SemiBold',
  },
  text: {
    fontSize: 16,
    color: Colors.textSecondary,
    marginBottom: 24,
    fontFamily: 'PlusJakartaSans-Regular',
  },
  button: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  buttonText: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'PlusJakartaSans-SemiBold',
  },
});
