import * as LocalAuthentication from 'expo-local-authentication';
import AsyncStorage from '@react-native-async-storage/async-storage';

export class BiometricService {
  private static readonly BIOMETRIC_ENABLED_KEY = '@secure_vault:biometric_enabled';
  private static readonly BIOMETRIC_VERIFIED_KEY = '@secure_vault:biometric_verified';

  /**
   * Verifica se o dispositivo suporta autenticação biométrica
   */
  public static async isBiometricAvailable(): Promise<boolean> {
    try {
      const compatible = await LocalAuthentication.hasHardwareAsync();
      if (!compatible) return false;

      const enrolled = await LocalAuthentication.isEnrolledAsync();
      return enrolled;
    } catch (error) {
      console.error('Erro ao verificar biometria:', error);
      return false;
    }
  }

  /**
   * Ativa a autenticação biométrica para o usuário
   */
  public static async enableBiometric(): Promise<boolean> {
    try {
      const isAvailable = await this.isBiometricAvailable();
      if (!isAvailable) {
        throw new Error('Biometria não disponível neste dispositivo');
      }

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Autentique para ativar biometria',
        disableDeviceFallback: true,
        cancelLabel: 'Cancelar'
      });

      if (result.success) {
        await AsyncStorage.setItem(this.BIOMETRIC_ENABLED_KEY, 'true');
        return true;
      }
      return false;
    } catch (error) {
      console.error('Erro ao ativar biometria:', error);
      throw error;
    }
  }

  /**
   * Desativa a autenticação biométrica
   */
  public static async disableBiometric(): Promise<void> {
    try {
      await AsyncStorage.removeItem(this.BIOMETRIC_ENABLED_KEY);
      await AsyncStorage.removeItem(this.BIOMETRIC_VERIFIED_KEY);
    } catch (error) {
      console.error('Erro ao desativar biometria:', error);
      throw error;
    }
  }

  /**
   * Verifica se a autenticação biométrica está ativada
   */
  public static async isBiometricEnabled(): Promise<boolean> {
    try {
      const enabled = await AsyncStorage.getItem(this.BIOMETRIC_ENABLED_KEY);
      return enabled === 'true';
    } catch (error) {
      console.error('Erro ao verificar status da biometria:', error);
      return false;
    }
  }

  /**
   * Autentica o usuário usando biometria
   */
  public static async authenticate(): Promise<boolean> {
    try {
      const isEnabled = await this.isBiometricEnabled();
      if (!isEnabled) {
        throw new Error('Biometria não está ativada');
      }

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Autentique para acessar o app',
        disableDeviceFallback: true,
        cancelLabel: 'Cancelar'
      });

      if (result.success) {
        await AsyncStorage.setItem(this.BIOMETRIC_VERIFIED_KEY, 'true');
        return true;
      }
      return false;
    } catch (error) {
      console.error('Erro na autenticação biométrica:', error);
      throw error;
    }
  }

  /**
   * Verifica se o usuário já foi autenticado na sessão atual
   */
  public static async isAuthenticated(): Promise<boolean> {
    try {
      const verified = await AsyncStorage.getItem(this.BIOMETRIC_VERIFIED_KEY);
      return verified === 'true';
    } catch (error) {
      console.error('Erro ao verificar autenticação:', error);
      return false;
    }
  }
} 