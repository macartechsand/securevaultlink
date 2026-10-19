import React, { useState, useEffect } from 'react';
import { View, FlatList, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { Text, IconButton, Surface } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { encryptionService, StoredPassword } from '../services/encryption';
import { useRouter } from 'expo-router';

export const PasswordList = () => {
  const [passwords, setPasswords] = useState<StoredPassword[]>([]);
  const router = useRouter();

  useEffect(() => {
    loadPasswords();
  }, []);

  const loadPasswords = async () => {
    try {
      await encryptionService.initializeMasterKey();
      const storedPasswords = await encryptionService.getAllPasswords();
      setPasswords(storedPasswords);
    } catch (error) {
      Alert.alert('Erro', 'Não foi possível carregar as senhas.');
    }
  };

  const handleDelete = async (id: string) => {
    Alert.alert(
      'Confirmar exclusão',
      'Tem certeza que deseja excluir esta senha?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            try {
              await encryptionService.deletePassword(id);
              await loadPasswords();
            } catch (error) {
              Alert.alert('Erro', 'Não foi possível excluir a senha.');
            }
          },
        },
      ]
    );
  };

  const renderItem = ({ item }: { item: StoredPassword }) => (
    <Surface style={styles.card}>
      <TouchableOpacity
        style={styles.cardContent}
        onPress={() => router.push(`/password/${item.id}`)}
      >
        <View style={styles.cardHeader}>
          <Ionicons 
            name={item.url ? 'globe-outline' : 'lock-closed-outline'} 
            size={24} 
            color="#666"
          />
          <View style={styles.titleContainer}>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.username}>{item.username}</Text>
          </View>
        </View>
        
        <View style={styles.actions}>
          <IconButton
            icon="pencil-outline"
            size={20}
            onPress={() => router.push(`/password/edit/${item.id}`)}
          />
          <IconButton
            icon="trash-outline"
            size={20}
            onPress={() => handleDelete(item.id)}
          />
        </View>
      </TouchableOpacity>
    </Surface>
  );

  return (
    <FlatList
      data={passwords}
      renderItem={renderItem}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.list}
      ListEmptyComponent={() => (
        <View style={styles.emptyContainer}>
          <Ionicons name="lock-closed-outline" size={48} color="#666" />
          <Text style={styles.emptyText}>
            Nenhuma senha cadastrada ainda
          </Text>
        </View>
      )}
    />
  );
};

const styles = StyleSheet.create({
  list: {
    padding: 16,
  },
  card: {
    marginBottom: 12,
    borderRadius: 8,
    elevation: 2,
  },
  cardContent: {
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  titleContainer: {
    marginLeft: 12,
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  username: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  actions: {
    flexDirection: 'row',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  emptyText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
}); 