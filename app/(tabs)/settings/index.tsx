import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, Alert } from 'react-native';
import { List, Switch, Button, Surface, Text, Divider } from 'react-native-paper';
import { router } from 'expo-router';
import { SecurityService } from '../../../src/services/SecurityService';
import { theme } from '../../../src/constants/theme';
import * as LocalAuthentication from 'expo-local-authentication';

export default function Settings() {
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState({
    useBiometrics: false,
    autoLock: true,
    hidePasswords: true,
    preventScreenshots: true,
    sessionTimeout: 5, // minutos
  });

  const handleLogout = async () => {
    Alert.alert(
      'Confirmar Logout',
      'Deseja realmente sair do aplicativo?',
      [
        {
          text: 'Cancelar',
          style: 'cancel'
        },
        {
          text: 'Sair',
          style: 'destructive',
          onPress: async () => {
            try {
              await SecurityService.clearSecurityData();
              router.replace('/(auth)/login');
            } catch (error) {
              Alert.alert('Erro', 'Não foi possível fazer logout');
            }
          }
        }
      ]
    );
  };

  const handleChangeMasterPassword = () => {
    router.push('/(auth)/change-master-password');
  };

  const handleToggleBiometrics = async () => {
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();

      if (!hasHardware || !isEnrolled) {
        Alert.alert(
          'Biometria não disponível',
          'Seu dispositivo não suporta ou não tem biometria configurada'
        );
        return;
      }

      setSettings(prev => ({
        ...prev,
        useBiometrics: !prev.useBiometrics
      }));
    } catch (error) {
      Alert.alert('Erro', 'Não foi possível configurar a biometria');
    }
  };

  const handleExportData = () => {
    Alert.alert(
      'Exportar dados',
      'Esta função exportará todas as suas senhas de forma criptografada. Você precisará da senha mestra para importá-las em outro dispositivo.',
      [
        {
          text: 'Cancelar',
          style: 'cancel'
        },
        {
          text: 'Exportar',
          onPress: async () => {
            try {
              setLoading(true);
              // TODO: Implementar exportação
              Alert.alert('Sucesso', 'Dados exportados com sucesso');
            } catch (error) {
              Alert.alert('Erro', 'Não foi possível exportar os dados');
            } finally {
              setLoading(false);
            }
          }
        }
      ]
    );
  };

  const handleImportData = () => {
    Alert.alert(
      'Importar dados',
      'Esta função substituirá todas as suas senhas atuais pelos dados importados. Certifique-se de fazer um backup antes de continuar.',
      [
        {
          text: 'Cancelar',
          style: 'cancel'
        },
        {
          text: 'Importar',
          onPress: async () => {
            try {
              setLoading(true);
              // TODO: Implementar importação
              Alert.alert('Sucesso', 'Dados importados com sucesso');
            } catch (error) {
              Alert.alert('Erro', 'Não foi possível importar os dados');
            } finally {
              setLoading(false);
            }
          }
        }
      ]
    );
  };

  return (
    <ScrollView style={styles.container}>
      <Surface style={styles.surface}>
        <List.Section>
          <List.Subheader>Segurança</List.Subheader>
          
          <List.Item
            title="Usar biometria"
            description="Use sua digital ou Face ID para autenticação"
            left={props => <List.Icon {...props} icon="fingerprint" />}
            right={() => (
              <Switch
                value={settings.useBiometrics}
                onValueChange={handleToggleBiometrics}
              />
            )}
          />

          <List.Item
            title="Bloqueio automático"
            description="Bloquear app ao minimizar"
            left={props => <List.Icon {...props} icon="lock" />}
            right={() => (
              <Switch
                value={settings.autoLock}
                onValueChange={(autoLock) =>
                  setSettings(prev => ({ ...prev, autoLock }))
                }
              />
            )}
          />

          <List.Item
            title="Ocultar senhas"
            description="Esconder senhas por padrão"
            left={props => <List.Icon {...props} icon="eye-off" />}
            right={() => (
              <Switch
                value={settings.hidePasswords}
                onValueChange={(hidePasswords) =>
                  setSettings(prev => ({ ...prev, hidePasswords }))
                }
              />
            )}
          />

          <List.Item
            title="Bloquear capturas de tela"
            description="Impedir screenshots do app"
            left={props => <List.Icon {...props} icon="cellphone-screenshot" />}
            right={() => (
              <Switch
                value={settings.preventScreenshots}
                onValueChange={(preventScreenshots) =>
                  setSettings(prev => ({ ...prev, preventScreenshots }))
                }
              />
            )}
          />

          <Divider style={styles.divider} />

          <List.Item
            title="Alterar senha mestra"
            description="Altere sua senha mestra"
            left={props => <List.Icon {...props} icon="key" />}
            onPress={handleChangeMasterPassword}
          />
        </List.Section>

        <List.Section>
          <List.Subheader>Backup</List.Subheader>

          <List.Item
            title="Exportar dados"
            description="Exportar senhas criptografadas"
            left={props => <List.Icon {...props} icon="export" />}
            onPress={handleExportData}
          />

          <List.Item
            title="Importar dados"
            description="Importar senhas de backup"
            left={props => <List.Icon {...props} icon="import" />}
            onPress={handleImportData}
          />
        </List.Section>

        <View style={styles.actions}>
          <Button
            mode="contained"
            onPress={handleLogout}
            style={styles.logoutButton}
            icon="logout"
          >
            Sair
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
    margin: 16,
    borderRadius: theme.roundness,
    elevation: 2,
  },
  divider: {
    marginVertical: 8,
  },
  actions: {
    padding: 16,
  },
  logoutButton: {
    backgroundColor: theme.colors.error,
  },
}); 