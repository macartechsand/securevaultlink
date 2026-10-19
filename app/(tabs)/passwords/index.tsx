import React, { useEffect, useState } from 'react';
import { View, StyleSheet, FlatList, Alert } from 'react-native';
import { Text, FAB, Searchbar, Chip, IconButton, Surface } from 'react-native-paper';
import { router } from 'expo-router';
import { Password, PasswordFilter } from '../../../src/models/Password';
import { PasswordService } from '../../../src/services/PasswordService';
import { theme } from '../../../src/constants/theme';
import * as Clipboard from 'expo-clipboard';

export default function PasswordList() {
  const [passwords, setPasswords] = useState<Password[]>([]);
  const [filter, setFilter] = useState<PasswordFilter>({
    search: '',
    favoritesOnly: false,
    sortBy: 'title',
    sortOrder: 'asc'
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPasswords();
  }, [filter]);

  const loadPasswords = async () => {
    try {
      const filteredPasswords = await PasswordService.filterPasswords(filter);
      setPasswords(filteredPasswords);
    } catch (error) {
      Alert.alert('Erro', 'Não foi possível carregar as senhas');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyPassword = async (password: string) => {
    try {
      await Clipboard.setStringAsync(password);
      Alert.alert('Sucesso', 'Senha copiada para a área de transferência');
    } catch (error) {
      Alert.alert('Erro', 'Não foi possível copiar a senha');
    }
  };

  const handleToggleFavorite = async (password: Password) => {
    try {
      await PasswordService.savePassword({
        ...password,
        isFavorite: !password.isFavorite
      });
      loadPasswords();
    } catch (error) {
      Alert.alert('Erro', 'Não foi possível atualizar o favorito');
    }
  };

  const handleDelete = async (password: Password) => {
    Alert.alert(
      'Confirmar exclusão',
      `Deseja realmente excluir a senha "${password.title}"?`,
      [
        {
          text: 'Cancelar',
          style: 'cancel'
        },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            try {
              await PasswordService.deletePassword(password.id);
              loadPasswords();
            } catch (error) {
              Alert.alert('Erro', 'Não foi possível excluir a senha');
            }
          }
        }
      ]
    );
  };

  const renderPasswordItem = ({ item: password }: { item: Password }) => (
    <Surface style={styles.passwordCard}>
      <View style={styles.passwordHeader}>
        <Text variant="titleMedium">{password.title}</Text>
        <View style={styles.headerActions}>
          <IconButton
            icon={password.isFavorite ? 'star' : 'star-outline'}
            onPress={() => handleToggleFavorite(password)}
          />
          <IconButton
            icon="dots-vertical"
            onPress={() => router.push(`/passwords/${password.id}`)}
          />
        </View>
      </View>

      {password.username && (
        <View style={styles.row}>
          <Text variant="bodyMedium">Usuário: {password.username}</Text>
          <IconButton
            icon="content-copy"
            size={20}
            onPress={() => Clipboard.setStringAsync(password.username!)}
          />
        </View>
      )}

      <View style={styles.row}>
        <Text variant="bodyMedium">
          Senha: {'•'.repeat(password.password.length)}
        </Text>
        <View style={styles.rowActions}>
          <IconButton
            icon="eye"
            size={20}
            onPress={() => Alert.alert('Senha', password.password)}
          />
          <IconButton
            icon="content-copy"
            size={20}
            onPress={() => handleCopyPassword(password.password)}
          />
        </View>
      </View>

      {password.url && (
        <View style={styles.row}>
          <Text variant="bodyMedium" style={styles.url}>
            {password.url}
          </Text>
        </View>
      )}

      <View style={styles.footer}>
        {password.category && (
          <Chip icon="folder" style={styles.chip}>
            {password.category}
          </Chip>
        )}
        <Text variant="bodySmall" style={styles.date}>
          Atualizado em {new Date(password.updatedAt).toLocaleDateString()}
        </Text>
      </View>
    </Surface>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Searchbar
          placeholder="Buscar senhas..."
          value={filter.search}
          onChangeText={(search) => setFilter({ ...filter, search })}
          style={styles.searchBar}
        />
        <View style={styles.filters}>
          <Chip
            selected={filter.favoritesOnly}
            onPress={() => setFilter({ ...filter, favoritesOnly: !filter.favoritesOnly })}
            icon="star"
          >
            Favoritos
          </Chip>
          <Chip
            selected={filter.sortBy === 'updatedAt'}
            onPress={() => setFilter({
              ...filter,
              sortBy: 'updatedAt',
              sortOrder: filter.sortOrder === 'asc' ? 'desc' : 'asc'
            })}
            icon={filter.sortOrder === 'asc' ? 'sort-ascending' : 'sort-descending'}
          >
            Data
          </Chip>
        </View>
      </View>

      <FlatList
        data={passwords}
        renderItem={renderPasswordItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text variant="titleMedium">Nenhuma senha encontrada</Text>
            <Text variant="bodyMedium">
              Adicione sua primeira senha clicando no botão abaixo
            </Text>
          </View>
        }
      />

      <FAB
        icon="plus"
        style={styles.fab}
        onPress={() => router.push('/passwords/new')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    padding: 16,
    backgroundColor: theme.colors.surface,
    elevation: 4,
  },
  searchBar: {
    marginBottom: 8,
  },
  filters: {
    flexDirection: 'row',
    gap: 8,
  },
  list: {
    padding: 16,
  },
  passwordCard: {
    padding: 16,
    marginBottom: 16,
    borderRadius: theme.roundness,
    elevation: 2,
  },
  passwordHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  headerActions: {
    flexDirection: 'row',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  rowActions: {
    flexDirection: 'row',
  },
  url: {
    color: theme.colors.primary,
    textDecorationLine: 'underline',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  chip: {
    height: 24,
  },
  date: {
    color: theme.colors.outline,
  },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 16,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
}); 