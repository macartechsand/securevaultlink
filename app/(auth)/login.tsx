import { View, StyleSheet, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { Text, TextInput, Button, Surface, HelperText } from 'react-native-paper';
import { useState, useEffect } from 'react';
import { theme } from '../../src/constants/theme';
import * as LocalAuthentication from 'expo-local-authentication';
import { router } from 'expo-router';
import { signIn, AuthError } from '../../src/services/auth';
import { SecurityService } from '../../src/services/SecurityService';
import { BlurView } from 'expo-blur';

export default function Login() {
  const [authState, setAuthState] = useState({
    email: '',
    password: '',
    masterPassword: '',
    loading: false,
    showMasterPassword: false,
    biometricAvailable: false
  });

  useEffect(() => {
    checkBiometric();
    initializeSecuritySettings();
  }, []);

  const checkBiometric = async () => {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    setAuthState(prev => ({
      ...prev,
      biometricAvailable: hasHardware && isEnrolled
    }));
  };

  const initializeSecuritySettings = async () => {
    const hasMasterPassword = await SecurityService.hasMasterPassword();
    setAuthState(prev => ({
      ...prev,
      showMasterPassword: hasMasterPassword
    }));
  };

  const handleAuth = async () => {
    const { email, password, masterPassword } = authState;
    
    if ((!email || !password) && !masterPassword) {
      Alert.alert('Erro', 'Por favor, preencha todos os campos necessários');
      return;
    }

    setAuthState(prev => ({ ...prev, loading: true }));
    
    try {
      if (authState.showMasterPassword) {
        await SecurityService.validateMasterPassword(masterPassword);
      } else {
        await signIn(email, password);
      }
      
      // Configurar timeout de sessão
      SecurityService.startSessionTimeout(() => {
        router.replace('/(auth)/login');
      });
      
      router.replace('/(tabs)');
    } catch (error) {
      const authError = error as AuthError;
      Alert.alert('Erro', authError.message);
    } finally {
      setAuthState(prev => ({ ...prev, loading: false }));
    }
  };

  const handleBiometric = async () => {
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Autenticar com biometria',
        fallbackLabel: 'Use sua senha mestra',
        disableDeviceFallback: false,
      });

      if (result.success) {
        SecurityService.startSessionTimeout(() => {
          router.replace('/(auth)/login');
        });
        router.replace('/(tabs)');
      }
    } catch (error) {
      Alert.alert('Erro', 'Não foi possível autenticar com biometria');
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <BlurView intensity={100} style={StyleSheet.absoluteFill}>
        <Surface style={styles.surface}>
          <Text variant="headlineMedium" style={styles.title}>
            SecureVault
          </Text>
          
          {authState.showMasterPassword ? (
            <TextInput
              label="Senha Mestra"
              value={authState.masterPassword}
              onChangeText={(text) => setAuthState(prev => ({ ...prev, masterPassword: text }))}
              mode="outlined"
              style={styles.input}
              secureTextEntry
              disabled={authState.loading}
            />
          ) : (
            <>
              <TextInput
                label="Email"
                value={authState.email}
                onChangeText={(text) => setAuthState(prev => ({ ...prev, email: text }))}
                mode="outlined"
                style={styles.input}
                keyboardType="email-address"
                autoCapitalize="none"
                disabled={authState.loading}
              />
              
              <TextInput
                label="Senha"
                value={authState.password}
                onChangeText={(text) => setAuthState(prev => ({ ...prev, password: text }))}
                mode="outlined"
                style={styles.input}
                secureTextEntry
                disabled={authState.loading}
              />
            </>
          )}

          <Button
            mode="contained"
            onPress={handleAuth}
            style={styles.button}
            loading={authState.loading}
            disabled={authState.loading}
          >
            Entrar
          </Button>

          {authState.biometricAvailable && (
            <Button
              mode="outlined"
              onPress={handleBiometric}
              style={styles.button}
              icon="fingerprint"
              disabled={authState.loading}
            >
              Entrar com Biometria
            </Button>
          )}

          <Button
            onPress={() => router.push('/(auth)/register')}
            style={styles.switchButton}
            disabled={authState.loading}
          >
            Criar nova conta
          </Button>
        </Surface>
      </BlurView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  surface: {
    padding: 24,
    margin: 16,
    borderRadius: theme.roundness,
    elevation: 4,
  },
  title: {
    textAlign: 'center',
    marginBottom: 24,
    color: theme.colors.primary,
    fontWeight: 'bold',
  },
  input: {
    marginBottom: 16,
  },
  button: {
    marginTop: 8,
  },
  switchButton: {
    marginTop: 16,
  },
}); 