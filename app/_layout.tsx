import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFrameworkReady } from '@/hooks/useFrameworkReady';
import { useFonts, PlusJakartaSans_400Regular, PlusJakartaSans_500Medium, PlusJakartaSans_600SemiBold, PlusJakartaSans_700Bold } from '@expo-google-fonts/plus-jakarta-sans';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as SplashScreen from 'expo-splash-screen';
import { useAuth } from '@/hooks/useAuth';
import { router } from 'expo-router';
import Colors from '@/constants/Colors';

// Keep the splash screen visible while we load fonts
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  useFrameworkReady();
  const { isAuthenticated, hasInitialized } = useAuth();
  const [appReady, setAppReady] = useState(false);

  const [fontsLoaded, fontError] = useFonts({
    'PlusJakartaSans-Regular': PlusJakartaSans_400Regular,
    'PlusJakartaSans-Medium': PlusJakartaSans_500Medium,
    'PlusJakartaSans-SemiBold': PlusJakartaSans_600SemiBold,
    'PlusJakartaSans-Bold': PlusJakartaSans_700Bold,
  });

  useEffect(() => {
    if ((fontsLoaded || fontError) && hasInitialized) {
      setAppReady(true);
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError, hasInitialized]);

  useEffect(() => {
    if (appReady && !isAuthenticated) {
      router.replace('/auth');
    } else if (appReady && isAuthenticated && router.canGoBack()) {
      // Se estiver autenticado e puder voltar, significa que estamos na rota /auth
      router.replace('/(tabs)/passwords');
    }
  }, [appReady, isAuthenticated]);

  if (!appReady) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Stack screenOptions={{ 
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
      }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="auth" options={{ headerShown: false }} />
        <Stack.Screen name="passwords/[id]" options={{ title: 'Password Details', presentation: 'modal' }} />
        <Stack.Screen name="passwords/add" options={{ title: 'Add New Password', presentation: 'modal' }} />
        <Stack.Screen name="link-checker/[id]" options={{ title: 'Link Check Results', presentation: 'modal' }} />
        <Stack.Screen name="modal/premium" options={{ title: 'Premium Plan', presentation: 'modal' }} />
        <Stack.Screen 
          name="+not-found" 
          options={{ 
            title: 'Página não encontrada',
            presentation: 'modal'
          }} 
        />
      </Stack>
      <StatusBar style="light" />
    </GestureHandlerRootView>
  );
}