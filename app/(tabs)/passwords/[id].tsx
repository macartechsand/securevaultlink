import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView, Alert } from 'react-native';
import { Text, TextInput, Button, Surface, Switch, HelperText } from 'react-native-paper';
import { useLocalSearchParams, router } from 'expo-router';
import { Password } from '../../../src/models/Password';
import { PasswordService } from '../../../src/services/PasswordService';
import { theme } from '../../../src/constants/theme';
import { PasswordStrengthMeter } from '../../../src/components/security/PasswordStrengthMeter';
import * as Clipboard from 'expo-clipboard';

export default function PasswordDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';

  const [password, setPassword] = useState<Partial<Password>>({
    title: '',
    username: '',
    password: '',
    url: '',
    notes: '',
    category: '',
    isFavorite: false,
    strength: 0,
    isCompromised: false
  });

  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [generatorOptions, setGeneratorOptions] = useState({
    length: 16,
    includeUppercase: true,
    includeLowercase: true,
    includeNumbers: true,
    includeSymbols: true,
    excludeAmbiguous: true,
    excludeSimilar: true
  });

  useEffect(() => {
    if (!isNew) {
      loadPassword();
    }
  }, [id]);

  const loadPassword = async () => {
    try {
      const loadedPassword = await PasswordService.getPassword(id);
      if (loadedPassword) {
        setPassword(loadedPassword);
      } else {
        Alert.alert('Erro', 'Senha não encontrada');
        router.back();
      }
    } catch (error) {
      Alert.alert('Erro', 'Não foi possível carregar a senha');
      router.back();
    }
  };

  const handleSave = async () => {
    if (!password.title || !password.password) {
      Alert.alert('Erro', 'Título e senha são obrigatórios');
      return;
    }

    setLoading(true);
    try {
      // Verificar se a senha foi vazada
      const isCompromised = await PasswordService.isPasswordCompromised(password.password);
      if (isCompromised) {
        Alert.alert(
          'Aviso',
          'Esta senha foi encontrada em vazamentos de dados. Recomendamos gerar uma nova senha.',
          [
            {
              text: 'Continuar mesmo assim',
              style: 'destructive',
              onPress: () => savePassword({ ...password, isCompromised: true })
            },
            {
              text: 'Gerar nova senha',
              onPress: handleGeneratePassword
            }
          ]
        );
        return;
      }

      await savePassword(password as Password);
    } catch (error) {
      Alert.alert('Erro', 'Não foi possível salvar a senha');
    } finally {
      setLoading(false);
    }
  };

  const savePassword = async (passwordToSave: Password) => {
    try {
      await PasswordService.savePassword(passwordToSave);
      router.back();
    } catch (error) {
      Alert.alert('Erro', 'Não foi possível salvar a senha');
    }
  };

  const handleGeneratePassword = () => {
    try {
      const generatedPassword = PasswordService.generatePassword(generatorOptions);
      setPassword(prev => ({
        ...prev,
        password: generatedPassword
      }));
    } catch (error) {
      Alert.alert('Erro', 'Não foi possível gerar a senha');
    }
  };

  return (
    <ScrollView style={styles.container}>
      <Surface style={styles.surface}>
        <Text variant="titleLarge" style={styles.title}>
          {isNew ? 'Nova Senha' : 'Editar Senha'}
        </Text>

        <TextInput
          label="Título"
          value={password.title}
          onChangeText={(title) => setPassword(prev => ({ ...prev, title }))}
          mode="outlined"
          style={styles.input}
          disabled={loading}
        />

        <TextInput
          label="Usuário"
          value={password.username}
          onChangeText={(username) => setPassword(prev => ({ ...prev, username }))}
          mode="outlined"
          style={styles.input}
          disabled={loading}
        />

        <View style={styles.passwordContainer}>
          <TextInput
            label="Senha"
            value={password.password}
            onChangeText={(newPassword) => setPassword(prev => ({ ...prev, password: newPassword }))}
            mode="outlined"
            style={[styles.input, styles.passwordInput]}
            secureTextEntry={!showPassword}
            disabled={loading}
            right={
              <TextInput.Icon
                icon={showPassword ? 'eye-off' : 'eye'}
                onPress={() => setShowPassword(!showPassword)}
              />
            }
          />
          <Button
            mode="contained"
            onPress={handleGeneratePassword}
            style={styles.generateButton}
            disabled={loading}
          >
            Gerar
          </Button>
        </View>

        <PasswordStrengthMeter password={password.password || ''} />

        <TextInput
          label="URL"
          value={password.url}
          onChangeText={(url) => setPassword(prev => ({ ...prev, url }))}
          mode="outlined"
          style={styles.input}
          keyboardType="url"
          disabled={loading}
        />

        <TextInput
          label="Categoria"
          value={password.category}
          onChangeText={(category) => setPassword(prev => ({ ...prev, category }))}
          mode="outlined"
          style={styles.input}
          disabled={loading}
        />

        <TextInput
          label="Notas"
          value={password.notes}
          onChangeText={(notes) => setPassword(prev => ({ ...prev, notes }))}
          mode="outlined"
          style={styles.input}
          multiline
          numberOfLines={4}
          disabled={loading}
        />

        <View style={styles.switchContainer}>
          <Text>Favorito</Text>
          <Switch
            value={password.isFavorite}
            onValueChange={(isFavorite) => setPassword(prev => ({ ...prev, isFavorite }))}
            disabled={loading}
          />
        </View>

        <Surface style={styles.generatorOptions}>
          <Text variant="titleMedium" style={styles.subtitle}>
            Opções do Gerador
          </Text>

          <View style={styles.optionRow}>
            <Text>Comprimento</Text>
            <TextInput
              value={generatorOptions.length.toString()}
              onChangeText={(value) => {
                const length = parseInt(value) || 8;
                setGeneratorOptions(prev => ({ ...prev, length }));
              }}
              mode="outlined"
              keyboardType="number-pad"
              style={styles.lengthInput}
            />
          </View>

          <View style={styles.optionRow}>
            <Text>Letras maiúsculas</Text>
            <Switch
              value={generatorOptions.includeUppercase}
              onValueChange={(includeUppercase) =>
                setGeneratorOptions(prev => ({ ...prev, includeUppercase }))
              }
            />
          </View>

          <View style={styles.optionRow}>
            <Text>Letras minúsculas</Text>
            <Switch
              value={generatorOptions.includeLowercase}
              onValueChange={(includeLowercase) =>
                setGeneratorOptions(prev => ({ ...prev, includeLowercase }))
              }
            />
          </View>

          <View style={styles.optionRow}>
            <Text>Números</Text>
            <Switch
              value={generatorOptions.includeNumbers}
              onValueChange={(includeNumbers) =>
                setGeneratorOptions(prev => ({ ...prev, includeNumbers }))
              }
            />
          </View>

          <View style={styles.optionRow}>
            <Text>Símbolos</Text>
            <Switch
              value={generatorOptions.includeSymbols}
              onValueChange={(includeSymbols) =>
                setGeneratorOptions(prev => ({ ...prev, includeSymbols }))
              }
            />
          </View>

          <View style={styles.optionRow}>
            <Text>Excluir caracteres ambíguos</Text>
            <Switch
              value={generatorOptions.excludeAmbiguous}
              onValueChange={(excludeAmbiguous) =>
                setGeneratorOptions(prev => ({ ...prev, excludeAmbiguous }))
              }
            />
          </View>

          <View style={styles.optionRow}>
            <Text>Excluir caracteres similares</Text>
            <Switch
              value={generatorOptions.excludeSimilar}
              onValueChange={(excludeSimilar) =>
                setGeneratorOptions(prev => ({ ...prev, excludeSimilar }))
              }
            />
          </View>
        </Surface>

        <View style={styles.actions}>
          <Button
            mode="contained"
            onPress={handleSave}
            style={styles.button}
            loading={loading}
            disabled={loading}
          >
            Salvar
          </Button>

          <Button
            mode="outlined"
            onPress={() => router.back()}
            style={styles.button}
            disabled={loading}
          >
            Cancelar
          </Button>
        </View>
      </Surface>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  surface: {
    padding: 16,
    margin: 16,
    borderRadius: theme.roundness,
    elevation: 2,
  },
  title: {
    textAlign: 'center',
    marginBottom: 24,
    color: theme.colors.primary,
  },
  subtitle: {
    marginBottom: 16,
    color: theme.colors.primary,
  },
  input: {
    marginBottom: 16,
  },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  passwordInput: {
    flex: 1,
  },
  generateButton: {
    marginTop: 6,
  },
  switchContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  generatorOptions: {
    padding: 16,
    marginTop: 16,
    marginBottom: 16,
    borderRadius: theme.roundness,
    elevation: 1,
  },
  optionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  lengthInput: {
    width: 80,
    height: 40,
    marginBottom: 0,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 16,
  },
  button: {
    flex: 1,
  },
}); 