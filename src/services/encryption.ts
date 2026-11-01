import CryptoJS from 'crypto-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';

// Constantes para armazenamento
const MASTER_KEY_STORAGE = '@secure_vault:master_key';
const PASSWORDS_STORAGE = '@secure_vault:passwords';

// Interface para senha armazenada
export interface StoredPassword {
  id: string;
  title: string;
  username: string;
  password: string;
  url?: string;
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

class EncryptionService {
  private masterKey: string | null = null;

  // Inicializa ou recupera a chave mestra
  async initializeMasterKey(): Promise<void> {
    let key = await AsyncStorage.getItem(MASTER_KEY_STORAGE);
    
    if (!key) {
      // Gera uma nova chave mestra segura de 256 bits (32 bytes)
      const randomBytes = await Crypto.getRandomBytesAsync(32);
      key = Array.from(new Uint8Array(randomBytes))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
      
      await AsyncStorage.setItem(MASTER_KEY_STORAGE, key);
    }
    
    this.masterKey = key;
  }

  // Encripta uma senha
  private encryptInternal(text: string): string {
    if (!this.masterKey) throw new Error('Master key not initialized');
    return CryptoJS.AES.encrypt(text, this.masterKey).toString();
  }

  // Decripta uma senha
  private decryptInternal(encryptedText: string): string {
    if (!this.masterKey) throw new Error('Master key not initialized');
    const bytes = CryptoJS.AES.decrypt(encryptedText, this.masterKey);
    return bytes.toString(CryptoJS.enc.Utf8);
  }

  // Métodos públicos para testes
  async encryptForTesting(text: string): Promise<string> {
    if (!this.masterKey) await this.initializeMasterKey();
    return this.encryptInternal(text);
  }

  async decryptForTesting(encryptedText: string): Promise<string> {
    if (!this.masterKey) await this.initializeMasterKey();
    return this.decryptInternal(encryptedText);
  }

  // Salva uma nova senha
  async savePassword(password: Omit<StoredPassword, 'id' | 'createdAt' | 'updatedAt'>): Promise<StoredPassword> {
    if (!this.masterKey) await this.initializeMasterKey();
    
    const passwords = await this.getAllPasswords();
    
    const newPassword: StoredPassword = {
      ...password,
      id: Date.now().toString(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      password: this.encryptInternal(password.password)
    };

    passwords.push(newPassword);
    await AsyncStorage.setItem(PASSWORDS_STORAGE, JSON.stringify(passwords));
    
    return newPassword;
  }

  // Recupera todas as senhas
  async getAllPasswords(): Promise<StoredPassword[]> {
    const passwordsStr = await AsyncStorage.getItem(PASSWORDS_STORAGE);
    return passwordsStr ? JSON.parse(passwordsStr) : [];
  }

  // Recupera uma senha específica
  async getPassword(id: string): Promise<StoredPassword | null> {
    const passwords = await this.getAllPasswords();
    const password = passwords.find(p => p.id === id);
    
    if (password) {
      return {
        ...password,
        password: this.decryptInternal(password.password)
      };
    }
    
    return null;
  }

  // Atualiza uma senha existente
  async updatePassword(id: string, updates: Partial<StoredPassword>): Promise<StoredPassword | null> {
    const passwords = await this.getAllPasswords();
    const index = passwords.findIndex(p => p.id === id);
    
    if (index === -1) return null;
    
    const updatedPassword = {
      ...passwords[index],
      ...updates,
      updatedAt: Date.now()
    };

    if (updates.password) {
      updatedPassword.password = this.encryptInternal(updates.password);
    }

    passwords[index] = updatedPassword;
    await AsyncStorage.setItem(PASSWORDS_STORAGE, JSON.stringify(passwords));
    
    return updatedPassword;
  }

  // Remove uma senha
  async deletePassword(id: string): Promise<boolean> {
    const passwords = await this.getAllPasswords();
    const filteredPasswords = passwords.filter(p => p.id !== id);
    
    if (filteredPasswords.length === passwords.length) return false;
    
    await AsyncStorage.setItem(PASSWORDS_STORAGE, JSON.stringify(filteredPasswords));
    return true;
  }
}

export const encryptionService = new EncryptionService(); 