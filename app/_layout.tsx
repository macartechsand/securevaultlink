import { Stack } from 'expo-router';
import { PaperProvider } from 'react-native-paper';
import { theme } from '../src/constants/theme';
import { useEffect } from 'react';
import { LogBox } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';

// Manter a tela de splash até que a aplicação esteja pronta
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  useEffect(() => {
    // Ignorar warnings específicos que não afetam a funcionalidade
    LogBox.ignoreLogs(['Warning: ...']); // Adicione warnings específicos conforme necessário
    
    // Esconder a tela de splash quando o app estiver pronto
    SplashScreen.hideAsync();
  }, []);

  return (
    <PaperProvider theme={theme}>
      <Stack>
        <Stack.Screen
          name="(auth)"
          options={{
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="(tabs)"
          options={{
            headerShown: false,
          }}
        />
      </Stack>
    </PaperProvider>
  );
} 