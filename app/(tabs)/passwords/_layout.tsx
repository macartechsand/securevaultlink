import { Stack } from 'expo-router';
import Colors from '@/constants/Colors';

export default function PasswordsLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: {
          backgroundColor: Colors.background,
        },
        headerTintColor: Colors.text,
        headerTitleStyle: {
          fontFamily: 'PlusJakartaSans-SemiBold',
        },
        contentStyle: {
          backgroundColor: Colors.background,
        },
      }}
    >
      <Stack.Screen 
        name="index" 
        options={{ 
          title: 'Password Vault',
          headerShadowVisible: false,
        }} 
      />
    </Stack>
  );
}