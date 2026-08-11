import { BiometricService } from '../../app/services/BiometricService';
import * as LocalAuthentication from 'expo-local-authentication';
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('expo-local-authentication');
jest.mock('@react-native-async-storage/async-storage');

describe('BiometricService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('isBiometricAvailable', () => {
    it('deve retornar true quando biometria está disponível', async () => {
      (LocalAuthentication.hasHardwareAsync as jest.Mock).mockResolvedValue(true);
      (LocalAuthentication.isEnrolledAsync as jest.Mock).mockResolvedValue(true);

      const result = await BiometricService.isBiometricAvailable();
      expect(result).toBe(true);
    });

    it('deve retornar false quando hardware não é compatível', async () => {
      (LocalAuthentication.hasHardwareAsync as jest.Mock).mockResolvedValue(false);

      const result = await BiometricService.isBiometricAvailable();
      expect(result).toBe(false);
    });

    it('deve retornar false quando biometria não está configurada', async () => {
      (LocalAuthentication.hasHardwareAsync as jest.Mock).mockResolvedValue(true);
      (LocalAuthentication.isEnrolledAsync as jest.Mock).mockResolvedValue(false);

      const result = await BiometricService.isBiometricAvailable();
      expect(result).toBe(false);
    });
  });

  describe('enableBiometric', () => {
    it('deve ativar biometria com sucesso', async () => {
      (LocalAuthentication.hasHardwareAsync as jest.Mock).mockResolvedValue(true);
      (LocalAuthentication.isEnrolledAsync as jest.Mock).mockResolvedValue(true);
      (LocalAuthentication.authenticateAsync as jest.Mock).mockResolvedValue({ success: true });

      const result = await BiometricService.enableBiometric();
      expect(result).toBe(true);
      expect(AsyncStorage.setItem).toHaveBeenCalledWith('@secure_vault:biometric_enabled', 'true');
    });

    it('deve falhar quando autenticação falha', async () => {
      (LocalAuthentication.hasHardwareAsync as jest.Mock).mockResolvedValue(true);
      (LocalAuthentication.isEnrolledAsync as jest.Mock).mockResolvedValue(true);
      (LocalAuthentication.authenticateAsync as jest.Mock).mockResolvedValue({ success: false });

      const result = await BiometricService.enableBiometric();
      expect(result).toBe(false);
      expect(AsyncStorage.setItem).not.toHaveBeenCalled();
    });
  });

  describe('authenticate', () => {
    it('deve autenticar com sucesso', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue('true');
      (LocalAuthentication.authenticateAsync as jest.Mock).mockResolvedValue({ success: true });

      const result = await BiometricService.authenticate();
      expect(result).toBe(true);
      expect(AsyncStorage.setItem).toHaveBeenCalledWith('@secure_vault:biometric_verified', 'true');
    });

    it('deve falhar quando biometria não está ativada', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);

      await expect(BiometricService.authenticate()).rejects.toThrow('Biometria não está ativada');
    });

    it('deve falhar quando autenticação falha', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue('true');
      (LocalAuthentication.authenticateAsync as jest.Mock).mockResolvedValue({ success: false });

      const result = await BiometricService.authenticate();
      expect(result).toBe(false);
    });
  });

  describe('disableBiometric', () => {
    it('deve desativar biometria com sucesso', async () => {
      await BiometricService.disableBiometric();
      expect(AsyncStorage.removeItem).toHaveBeenCalledWith('@secure_vault:biometric_enabled');
      expect(AsyncStorage.removeItem).toHaveBeenCalledWith('@secure_vault:biometric_verified');
    });
  });
}); 