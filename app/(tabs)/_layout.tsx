import { Tabs } from 'expo-router';
import { useEffect } from 'react';
import { router } from 'expo-router';
import { SecurityService } from '../../src/services/SecurityService';
import { theme } from '../../src/constants/theme';
import { AppState, AppStateStatus } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

export default function TabLayout() {
  useEffect(() => {
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    setupSecurityTimeout();

    return () => {
      subscription.remove();
      SecurityService.clearSessionTimeout();
    };
  }, []);

  const handleAppStateChange = (nextAppState: AppStateStatus) => {
    if (nextAppState === 'background' || nextAppState === 'inactive') {
      // Redirecionar para tela de login quando app vai para background
      router.replace('/(auth)/login');
    }
  };

  const setupSecurityTimeout = () => {
    SecurityService.startSessionTimeout(() => {
      router.replace('/(auth)/login');
    });
  };

  return (
    <Tabs
      screenOptions={{
        headerStyle: {
          backgroundColor: theme.colors.primary,
        },
        headerTintColor: '#fff',
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.outline,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Início',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="home" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="passwords"
        options={{
          title: 'Senhas',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="key" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Configurações',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="cog" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
} 