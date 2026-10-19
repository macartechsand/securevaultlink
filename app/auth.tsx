import { View, StyleSheet, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { Text, TextInput, Button, Surface } from 'react-native-paper';
import { useState } from 'react';
import { theme } from '../src/constants/theme';
import * as LocalAuthentication from 'expo-local-authentication';
import { router } from 'expo-router';
import { signIn, signUp, AuthError } from '../src/services/auth';

export default function Auth() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleAuth = async () => {
    if (!email || !password) {
      Alert.alert('Erro', 'Por favor, preencha todos os campos');
      return;
    }

    setLoading(true);
    try {
      if (isRegistering) {
        await signUp(email, password);
      } else {
        await signIn(email, password);
      }
      router.replace('/(tabs)');
    } catch (error) {
      const authError = error as AuthError;
      Alert.alert('Erro', authError.message);
    } finally {
      setLoading(false);
    }
  };

  const handleBiometric = async () => {
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      if (!hasHardware) {
        Alert.alert('Erro', 'Seu dispositivo não suporta autenticação biométrica');
        return;
      }

      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      if (!isEnrolled) {
        Alert.alert('Erro', 'Nenhuma biometria cadastrada no dispositivo');
        return;
      }

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Autenticar com biometria',
        fallbackLabel: 'Use sua senha',
      });

      if (result.success) {
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
      <Surface style={styles.surface}>
        <Text variant="headlineMedium" style={styles.title}>
          {isRegistering ? 'Criar Conta' : 'Login'}
        </Text>
        
        <TextInput
          label="Email"
          value={email}
          onChangeText={setEmail}
          mode="outlined"
          style={styles.input}
          keyboardType="email-address"
          autoCapitalize="none"
          disabled={loading}
        />
        
        <TextInput
          label="Senha"
          value={password}
          onChangeText={setPassword}
          mode="outlined"
          style={styles.input}
          secureTextEntry
          disabled={loading}
        />

        <Button
          mode="contained"
          onPress={handleAuth}
          style={styles.button}
          loading={loading}
          disabled={loading}
        >
          {isRegistering ? 'Registrar' : 'Entrar'}
        </Button>

        {!isRegistering && (
          <Button
            mode="outlined"
            onPress={handleBiometric}
            style={styles.button}
            icon="fingerprint"
            disabled={loading}
          >
            Entrar com Biometria
          </Button>
        )}

        <Button
          onPress={() => setIsRegistering(!isRegistering)}
          style={styles.switchButton}
          disabled={loading}
        >
          {isRegistering
            ? 'Já tem uma conta? Entre'
            : 'Não tem uma conta? Registre-se'}
        </Button>
      </Surface>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    justifyContent: 'center',
    padding: 16,
  },
  surface: {
    padding: 24,
    borderRadius: theme.roundness,
    elevation: 4,
  },
  title: {
    textAlign: 'center',
    marginBottom: 24,
    color: theme.colors.primary,
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