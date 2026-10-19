import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { AppState, AppStateStatus } from 'react-native';

const MASTER_PASSWORD_KEY = '@secure_vault:master_password';
const SESSION_TIMEOUT = 5 * 60 * 1000; // 5 minutos

export class SecurityService {
  private static sessionTimeoutId: NodeJS.Timeout | null = null;
  private static appStateSubscription: any = null;
  private static masterPassword: string | null = null;

  static async hasMasterPassword(): Promise<boolean> {
    const hashedPassword = await AsyncStorage.getItem(MASTER_PASSWORD_KEY);
    return hashedPassword !== null;
  }

  static async setMasterPassword(password: string): Promise<void> {
    const hashedPassword = await this.hashPassword(password);
    await AsyncStorage.setItem(MASTER_PASSWORD_KEY, hashedPassword);
    this.masterPassword = password; // Manter em memória para uso na criptografia
  }

  static async getMasterPassword(): Promise<string | null> {
    return this.masterPassword;
  }

  static async validateMasterPassword(password: string): Promise<boolean> {
    const storedHash = await AsyncStorage.getItem(MASTER_PASSWORD_KEY);
    if (!storedHash) return false;

    const inputHash = await this.hashPassword(password);
    const isValid = storedHash === inputHash;
    
    if (isValid) {
      this.masterPassword = password; // Manter em memória para uso na criptografia
    }
    
    return isValid;
  }

  private static async hashPassword(password: string): Promise<string> {
    const data = new TextEncoder().encode(password);
    const hash = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      password
    );
    return hash;
  }

  static startSessionTimeout(onTimeout: () => void): void {
    if (this.sessionTimeoutId) {
      clearTimeout(this.sessionTimeoutId);
    }

    this.sessionTimeoutId = setTimeout(() => {
      this.masterPassword = null; // Limpar senha mestra da memória
      onTimeout();
    }, SESSION_TIMEOUT);

    // Monitorar estado do app
    if (!this.appStateSubscription) {
      this.appStateSubscription = AppState.addEventListener(
        'change',
        (nextAppState: AppStateStatus) => {
          if (nextAppState === 'background' || nextAppState === 'inactive') {
            // Forçar timeout quando app vai para background
            if (this.sessionTimeoutId) {
              clearTimeout(this.sessionTimeoutId);
            }
            this.masterPassword = null; // Limpar senha mestra da memória
            onTimeout();
          }
        }
      );
    }
  }

  static clearSessionTimeout(): void {
    if (this.sessionTimeoutId) {
      clearTimeout(this.sessionTimeoutId);
      this.sessionTimeoutId = null;
    }

    if (this.appStateSubscription) {
      this.appStateSubscription.remove();
      this.appStateSubscription = null;
    }

    this.masterPassword = null; // Limpar senha mestra da memória
  }

  static async clearSecurityData(): Promise<void> {
    await AsyncStorage.removeItem(MASTER_PASSWORD_KEY);
    this.masterPassword = null;
    this.clearSessionTimeout();
  }
} 