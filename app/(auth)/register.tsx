import { View, StyleSheet, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { Text, TextInput, Button, Surface, HelperText } from 'react-native-paper';
import { useState } from 'react';
import { theme } from '../../src/constants/theme';
import { router } from 'expo-router';
import { signUp, AuthError } from '../../src/services/auth';
import { SecurityService } from '../../src/services/SecurityService';
import { PasswordStrengthMeter } from '../../src/components/security/PasswordStrengthMeter';
import { BlurView } from 'expo-blur';
import zxcvbn from 'zxcvbn';

export default function Register() {
  const [formState, setFormState] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    masterPassword: '',
    confirmMasterPassword: '',
    loading: false
  });

  const [errors, setErrors] = useState({
    password: '',
    masterPassword: ''
  });

  const validatePasswords = () => {
    const newErrors = { password: '', masterPassword: '' };
    let isValid = true;

    // Validar senha da conta
    if (formState.password !== formState.confirmPassword) {
      newErrors.password = 'As senhas não coincidem';
      isValid = false;
    }

    const passwordStrength = zxcvbn(formState.password);
    if (passwordStrength.score < 3) {
      newErrors.password = 'A senha é muito fraca. Use uma combinação de letras, números e símbolos.';
      isValid = false;
    }

    // Validar senha mestra
    if (formState.masterPassword !== formState.confirmMasterPassword) {
      newErrors.masterPassword = 'As senhas mestras não coincidem';
      isValid = false;
    }

    const masterPasswordStrength = zxcvbn(formState.masterPassword);
    if (masterPasswordStrength.score < 4) {
      newErrors.masterPassword = 'A senha mestra precisa ser muito forte. Use uma frase longa com caracteres especiais.';
      isValid = false;
    }

    setErrors(newErrors);
    return isValid;
  };

  const handleRegister = async () => {
    if (!validatePasswords()) {
      return;
    }

    setFormState(prev => ({ ...prev, loading: true }));

    try {
      // Registrar usuário
      await signUp(formState.email, formState.password);
      
      // Configurar senha mestra
      await SecurityService.setMasterPassword(formState.masterPassword);
      
      Alert.alert(
        'Sucesso',
        'Conta criada com sucesso! Guarde sua senha mestra em um local seguro.',
        [
          {
            text: 'OK',
            onPress: () => router.replace('/(auth)/login')
          }
        ]
      );
    } catch (error) {
      const authError = error as AuthError;
      Alert.alert('Erro', authError.message);
    } finally {
      setFormState(prev => ({ ...prev, loading: false }));
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
            Criar Conta
          </Text>
          
          <TextInput
            label="Email"
            value={formState.email}
            onChangeText={(text) => setFormState(prev => ({ ...prev, email: text }))}
            mode="outlined"
            style={styles.input}
            keyboardType="email-address"
            autoCapitalize="none"
            disabled={formState.loading}
          />
          
          <TextInput
            label="Senha"
            value={formState.password}
            onChangeText={(text) => setFormState(prev => ({ ...prev, password: text }))}
            mode="outlined"
            style={styles.input}
            secureTextEntry
            disabled={formState.loading}
          />

          <TextInput
            label="Confirmar Senha"
            value={formState.confirmPassword}
            onChangeText={(text) => setFormState(prev => ({ ...prev, confirmPassword: text }))}
            mode="outlined"
            style={styles.input}
            secureTextEntry
            disabled={formState.loading}
          />

          {errors.password ? (
            <HelperText type="error" visible={true}>
              {errors.password}
            </HelperText>
          ) : null}

          <PasswordStrengthMeter password={formState.password} />

          <View style={styles.divider} />

          <Text variant="titleMedium" style={styles.subtitle}>
            Senha Mestra
          </Text>
          <Text variant="bodySmall" style={styles.description}>
            Esta senha será usada para proteger seus dados. Não poderá ser recuperada se perdida.
          </Text>

          <TextInput
            label="Senha Mestra"
            value={formState.masterPassword}
            onChangeText={(text) => setFormState(prev => ({ ...prev, masterPassword: text }))}
            mode="outlined"
            style={styles.input}
            secureTextEntry
            disabled={formState.loading}
          />

          <TextInput
            label="Confirmar Senha Mestra"
            value={formState.confirmMasterPassword}
            onChangeText={(text) => setFormState(prev => ({ ...prev, confirmMasterPassword: text }))}
            mode="outlined"
            style={styles.input}
            secureTextEntry
            disabled={formState.loading}
          />

          {errors.masterPassword ? (
            <HelperText type="error" visible={true}>
              {errors.masterPassword}
            </HelperText>
          ) : null}

          <PasswordStrengthMeter password={formState.masterPassword} />

          <Button
            mode="contained"
            onPress={handleRegister}
            style={styles.button}
            loading={formState.loading}
            disabled={formState.loading}
          >
            Criar Conta
          </Button>

          <Button
            onPress={() => router.back()}
            style={styles.switchButton}
            disabled={formState.loading}
          >
            Voltar para Login
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
  subtitle: {
    marginBottom: 8,
    color: theme.colors.primary,
  },
  description: {
    marginBottom: 16,
    color: theme.colors.error,
  },
  input: {
    marginBottom: 16,
  },
  button: {
    marginTop: 24,
  },
  switchButton: {
    marginTop: 16,
  },
  divider: {
    height: 1,
    backgroundColor: theme.colors.outline,
    marginVertical: 24,
  },
}); 