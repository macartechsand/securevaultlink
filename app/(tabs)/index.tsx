import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Text, Surface, Button, List, Card } from 'react-native-paper';
import { router } from 'expo-router';
import { Password } from '../../src/models/Password';
import { PasswordService } from '../../src/services/PasswordService';
import { theme } from '../../src/constants/theme';
import { MaterialCommunityIcons } from '@expo/vector-icons';

export default function Home() {
  const [stats, setStats] = useState({
    totalPasswords: 0,
    weakPasswords: 0,
    compromisedPasswords: 0,
    favorites: 0,
  });

  const [recentPasswords, setRecentPasswords] = useState<Password[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const passwords = await PasswordService.getAllPasswords();
      
      setStats({
        totalPasswords: passwords.length,
        weakPasswords: passwords.filter(p => p.strength < 3).length,
        compromisedPasswords: passwords.filter(p => p.isCompromised).length,
        favorites: passwords.filter(p => p.isFavorite).length,
      });

      // Ordenar por data de atualização e pegar os 5 mais recentes
      const recent = [...passwords]
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
        .slice(0, 5);
      
      setRecentPasswords(recent);
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    }
  };

  const renderStatCard = (title: string, value: number, icon: string, color: string) => (
    <Surface style={[styles.statCard, { borderLeftColor: color }]}>
      <MaterialCommunityIcons name={icon} size={24} color={color} />
      <Text variant="titleLarge" style={{ color }}>
        {value}
      </Text>
      <Text variant="bodyMedium">{title}</Text>
    </Surface>
  );

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text variant="headlineMedium" style={styles.title}>
          Bem-vindo ao SecureVault
        </Text>
        <Text variant="bodyMedium" style={styles.subtitle}>
          Gerencie suas senhas com segurança
        </Text>
      </View>

      <View style={styles.statsContainer}>
        {renderStatCard(
          'Total de Senhas',
          stats.totalPasswords,
          'key',
          theme.colors.primary
        )}
        {renderStatCard(
          'Senhas Fracas',
          stats.weakPasswords,
          'alert',
          theme.colors.error
        )}
        {renderStatCard(
          'Senhas Vazadas',
          stats.compromisedPasswords,
          'shield-alert',
          theme.colors.warning
        )}
        {renderStatCard(
          'Favoritos',
          stats.favorites,
          'star',
          theme.colors.secondary
        )}
      </View>

      <Surface style={styles.actionsCard}>
        <Text variant="titleMedium" style={styles.sectionTitle}>
          Ações Rápidas
        </Text>
        <View style={styles.actions}>
          <Button
            mode="contained"
            icon="plus"
            onPress={() => router.push('/passwords/new')}
            style={styles.actionButton}
          >
            Nova Senha
          </Button>
          <Button
            mode="outlined"
            icon="magnify"
            onPress={() => router.push('/passwords')}
            style={styles.actionButton}
          >
            Buscar Senhas
          </Button>
        </View>
      </Surface>

      <Surface style={styles.recentCard}>
        <Text variant="titleMedium" style={styles.sectionTitle}>
          Senhas Recentes
        </Text>
        {recentPasswords.map((password) => (
          <List.Item
            key={password.id}
            title={password.title}
            description={password.username}
            left={(props) => (
              <List.Icon
                {...props}
                icon={password.isFavorite ? 'star' : 'key'}
                color={password.isFavorite ? theme.colors.primary : undefined}
              />
            )}
            right={(props) => (
              <MaterialCommunityIcons
                name="chevron-right"
                size={24}
                color={theme.colors.outline}
              />
            )}
            onPress={() => router.push(`/passwords/${password.id}`)}
          />
        ))}
        {recentPasswords.length === 0 && (
          <Text variant="bodyMedium" style={styles.emptyText}>
            Nenhuma senha adicionada ainda
          </Text>
        )}
      </Surface>

      <Surface style={styles.securityCard}>
        <Text variant="titleMedium" style={styles.sectionTitle}>
          Dicas de Segurança
        </Text>
        <List.Item
          title="Use senhas fortes"
          description="Combine letras, números e símbolos"
          left={(props) => <List.Icon {...props} icon="shield-check" />}
        />
        <List.Item
          title="Evite senhas repetidas"
          description="Use senhas únicas para cada conta"
          left={(props) => <List.Icon {...props} icon="shield-alert" />}
        />
        <List.Item
          title="Ative autenticação em duas etapas"
          description="Adicione uma camada extra de segurança"
          left={(props) => <List.Icon {...props} icon="two-factor-authentication" />}
        />
      </Surface>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    padding: 16,
    backgroundColor: theme.colors.primary,
  },
  title: {
    color: '#fff',
    fontWeight: 'bold',
  },
  subtitle: {
    color: '#fff',
    opacity: 0.8,
  },
  statsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 8,
    marginTop: -32,
  },
  statCard: {
    flex: 1,
    minWidth: '45%',
    margin: 8,
    padding: 16,
    borderRadius: theme.roundness,
    elevation: 2,
    borderLeftWidth: 4,
    alignItems: 'center',
  },
  actionsCard: {
    margin: 16,
    padding: 16,
    borderRadius: theme.roundness,
    elevation: 2,
  },
  sectionTitle: {
    marginBottom: 16,
    color: theme.colors.primary,
  },
  actions: {
    flexDirection: 'row',
    gap: 16,
  },
  actionButton: {
    flex: 1,
  },
  recentCard: {
    margin: 16,
    padding: 16,
    borderRadius: theme.roundness,
    elevation: 2,
  },
  emptyText: {
    textAlign: 'center',
    color: theme.colors.outline,
    marginVertical: 16,
  },
  securityCard: {
    margin: 16,
    padding: 16,
    borderRadius: theme.roundness,
    elevation: 2,
  },
}); 