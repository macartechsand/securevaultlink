import React, { useState, useCallback, useEffect } from 'react';
import { View, StyleSheet, ScrollView, Alert } from 'react-native';
import { TextInput, Button, HelperText, IconButton, ActivityIndicator } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { encryptionService, StoredPassword } from '../services/encryption';
import { generatePassword } from '../utils/passwordGenerator';
import { HIBPService } from '../services/hibp';
import { VirusTotalService, URLScanResult } from '../services/virusTotal';
import { analyzePasswordStrength } from '../utils/passwordStrength';
import { PasswordStrengthMeter } from './PasswordStrengthMeter';
import { debounce } from 'lodash';

interface PasswordFormProps {
  initialData?: StoredPassword;
  mode: 'create' | 'edit';
}

export const PasswordForm = ({ initialData, mode }: PasswordFormProps) => {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [checkingPassword, setCheckingPassword] = useState(false);
  const [passwordSecure, setPasswordSecure] = useState(true);
  const [breachInfo, setBreachInfo] = useState<{ isBreached: boolean; count: number } | null>(null);
  const [passwordStrength, setPasswordStrength] = useState(analyzePasswordStrength(''));
  const [checkingURL, setCheckingURL] = useState(false);
  const [urlScanResult, setUrlScanResult] = useState<URLScanResult | null>(null);
  
  const [formData, setFormData] = useState({
    title: initialData?.title || '',
    username: initialData?.username || '',
    password: initialData?.password || '',
    url: initialData?.url || '',
    notes: initialData?.notes || '',
  });

  const [errors, setErrors] = useState({
    title: '',
    username: '',
    password: '',
  });

  const validate = () => {
    const newErrors = {
      title: '',
      username: '',
      password: '',
    };

    if (!formData.title.trim()) {
      newErrors.title = 'O título é obrigatório';
    }
    if (!formData.username.trim()) {
      newErrors.username = 'O usuário é obrigatório';
    }
    if (!formData.password.trim()) {
      newErrors.password = 'A senha é obrigatória';
    }

    setErrors(newErrors);
    return !Object.values(newErrors).some(error => error !== '');
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    setLoading(true);
    try {
      if (mode === 'create') {
        await encryptionService.savePassword(formData);
        Alert.alert('Sucesso', 'Senha salva com sucesso!');
      } else if (initialData?.id) {
        await encryptionService.updatePassword(initialData.id, formData);
        Alert.alert('Sucesso', 'Senha atualizada com sucesso!');
      }
      router.back();
    } catch (error) {
      Alert.alert('Erro', 'Não foi possível salvar a senha.');
    } finally {
      setLoading(false);
    }
  };

  // Verifica se a senha foi vazada
  const checkPasswordBreach = useCallback(
    debounce(async (password: string) => {
      if (!password) return;
      
      setCheckingPassword(true);
      try {
        const result = await HIBPService.checkPassword(password);
        setBreachInfo(result);
      } catch (error) {
        console.error('Erro ao verificar senha:', error);
      } finally {
        setCheckingPassword(false);
      }
    }, 1000),
    []
  );

  const handlePasswordChange = (text: string) => {
    setFormData(prev => ({ ...prev, password: text }));
    setPasswordStrength(analyzePasswordStrength(text));
    checkPasswordBreach(text);
  };

  const handleGeneratePassword = () => {
    const newPassword = generatePassword({
      length: 16,
      includeLowercase: true,
      includeUppercase: true,
      includeNumbers: true,
      includeSymbols: true,
    });
    handlePasswordChange(newPassword);
  };

  const getPasswordHelperText = () => {
    if (checkingPassword) return 'Verificando segurança da senha...';
    if (breachInfo?.isBreached) {
      return `⚠️ Esta senha foi encontrada em ${breachInfo.count.toLocaleString()} vazamentos de dados. Recomendamos usar outra senha.`;
    }
    if (breachInfo && !breachInfo.isBreached) {
      return '✅ Senha segura - não foi encontrada em vazamentos conhecidos';
    }
    return '';
  };

  const getPasswordHelperType = () => {
    if (checkingPassword) return 'info';
    if (breachInfo?.isBreached) return 'error';
    if (breachInfo && !breachInfo.isBreached) return 'info';
    return 'info';
  };

  // Verifica a URL usando o VirusTotal
  const checkURL = useCallback(
    debounce(async (url: string) => {
      if (!url) {
        setUrlScanResult(null);
        return;
      }

      setCheckingURL(true);
      try {
        // Primeiro tenta uma verificação rápida
        let result = await VirusTotalService.quickScanURL(url);
        
        // Se não encontrou no cache, faz uma verificação completa
        if (!result) {
          result = await VirusTotalService.scanURL(url);
        }
        
        setUrlScanResult(result);

        if (!result.isClean) {
          Alert.alert(
            'URL Suspeita',
            `Esta URL foi marcada como suspeita por ${result.positives} de ${result.total} serviços de segurança.\n\nAmeaças detectadas:\n${result.threats.join('\n')}`,
            [{ text: 'OK' }]
          );
        }
      } catch (error) {
        console.error('Erro ao verificar URL:', error);
      } finally {
        setCheckingURL(false);
      }
    }, 1500),
    []
  );

  const handleURLChange = (text: string) => {
    setFormData(prev => ({ ...prev, url: text }));
    checkURL(text);
  };

  const getURLHelperText = () => {
    if (checkingURL) return 'Verificando segurança da URL...';
    if (urlScanResult?.isClean) return '✅ URL segura';
    if (urlScanResult && !urlScanResult.isClean) {
      return `⚠️ URL suspeita - ${urlScanResult.positives} ameaças detectadas`;
    }
    return '';
  };

  const getURLHelperType = () => {
    if (checkingURL) return 'info';
    if (urlScanResult?.isClean) return 'info';
    if (urlScanResult && !urlScanResult.isClean) return 'error';
    return 'info';
  };

  const canSubmit = () => {
    return !loading && 
           !breachInfo?.isBreached && 
           passwordStrength.score >= 3 && // Exige senha forte
           Object.values(errors).every(error => !error);
  };

  return (
    <ScrollView style={styles.container}>
      <TextInput
        label="Título"
        value={formData.title}
        onChangeText={(text) => setFormData(prev => ({ ...prev, title: text }))}
        mode="outlined"
        error={!!errors.title}
        style={styles.input}
      />
      <HelperText type="error" visible={!!errors.title}>
        {errors.title}
      </HelperText>

      <TextInput
        label="Usuário"
        value={formData.username}
        onChangeText={(text) => setFormData(prev => ({ ...prev, username: text }))}
        mode="outlined"
        error={!!errors.username}
        style={styles.input}
      />
      <HelperText type="error" visible={!!errors.username}>
        {errors.username}
      </HelperText>

      <View style={styles.passwordContainer}>
        <TextInput
          label="Senha"
          value={formData.password}
          onChangeText={handlePasswordChange}
          mode="outlined"
          error={!!errors.password || breachInfo?.isBreached}
          secureTextEntry={passwordSecure}
          style={[styles.input, styles.passwordInput]}
          right={
            <TextInput.Icon
              icon={passwordSecure ? 'eye' : 'eye-off'}
              onPress={() => setPasswordSecure(!passwordSecure)}
            />
          }
        />
        <Button
          mode="contained"
          onPress={handleGeneratePassword}
          style={styles.generateButton}
        >
          Gerar
        </Button>
      </View>

      <PasswordStrengthMeter strength={passwordStrength} />

      <HelperText
        type={getPasswordHelperType()}
        visible={!!errors.password || checkingPassword || breachInfo !== null}
      >
        {errors.password || getPasswordHelperText()}
      </HelperText>

      <TextInput
        label="URL"
        value={formData.url}
        onChangeText={handleURLChange}
        mode="outlined"
        error={urlScanResult ? !urlScanResult.isClean : false}
        style={styles.input}
        right={
          checkingURL ? (
            <TextInput.Icon
              icon={() => <ActivityIndicator animating={true} />}
            />
          ) : urlScanResult && (
            <TextInput.Icon
              icon={urlScanResult.isClean ? 'check-circle' : 'alert-circle'}
              color={urlScanResult.isClean ? '#32cd32' : '#ff4444'}
            />
          )
        }
      />
      <HelperText
        type={getURLHelperType()}
        visible={!!formData.url && (checkingURL || urlScanResult !== null)}
      >
        {getURLHelperText()}
      </HelperText>

      <TextInput
        label="Notas (opcional)"
        value={formData.notes}
        onChangeText={(text) => setFormData(prev => ({ ...prev, notes: text }))}
        mode="outlined"
        multiline
        numberOfLines={4}
        style={styles.input}
      />

      <Button
        mode="contained"
        onPress={handleSubmit}
        loading={loading}
        style={styles.submitButton}
        disabled={!canSubmit()}
      >
        {mode === 'create' ? 'Salvar' : 'Atualizar'}
      </Button>

      {!canSubmit() && passwordStrength.score < 3 && (
        <HelperText type="error" visible={true}>
          Por favor, use uma senha mais forte antes de salvar
        </HelperText>
      )}

      {breachInfo?.isBreached && (
        <HelperText type="error" visible={true}>
          Por favor, escolha uma senha diferente antes de salvar
        </HelperText>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 16,
  },
  input: {
    marginBottom: 4,
  },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  passwordInput: {
    flex: 1,
  },
  generateButton: {
    marginLeft: 8,
    marginBottom: 4,
  },
  submitButton: {
    marginTop: 16,
  },
}); 