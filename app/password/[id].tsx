import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Text, Button } from 'react-native-paper';
import { encryptionService, StoredPassword } from '../../src/services/encryption';
import { PasswordForm } from '../../src/components/PasswordForm';

export default function PasswordDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const [password, setPassword] = useState<StoredPassword | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    loadPassword();
  }, [id]);

  const loadPassword = async () => {
    if (!id || typeof id !== 'string') {
      router.back();
      return;
    }

    try {
      const data = await encryptionService.getPassword(id);
      if (data) {
        setPassword(data);
      } else {
        Alert.alert('Erro', 'Senha não encontrada');
        router.back();
      }
    } catch (error) {
      Alert.alert('Erro', 'Não foi possível carregar a senha');
      router.back();
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!password) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text>Senha não encontrada</Text>
      </View>
    );
  }

  if (isEditing) {
    return (
      <View style={styles.container}>
        <PasswordForm mode="edit" initialData={password} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text variant="titleLarge" style={styles.title}>{password.title}</Text>
        <Text variant="bodyLarge" style={styles.label}>Usuário</Text>
        <Text variant="bodyMedium" style={styles.value}>{password.username}</Text>
        
        <Text variant="bodyLarge" style={styles.label}>Senha</Text>
        <Text variant="bodyMedium" style={styles.value}>{password.password}</Text>
        
        {password.url && (
          <>
            <Text variant="bodyLarge" style={styles.label}>URL</Text>
            <Text variant="bodyMedium" style={styles.value}>{password.url}</Text>
          </>
        )}
        
        {password.notes && (
          <>
            <Text variant="bodyLarge" style={styles.label}>Notas</Text>
            <Text variant="bodyMedium" style={styles.value}>{password.notes}</Text>
          </>
        )}
      </View>

      <Button
        mode="contained"
        onPress={() => setIsEditing(true)}
        style={styles.editButton}
      >
        Editar
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    padding: 16,
  },
  title: {
    marginBottom: 24,
  },
  label: {
    color: '#666',
    marginTop: 16,
  },
  value: {
    marginTop: 4,
  },
  editButton: {
    margin: 16,
  },
}); 