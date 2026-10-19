import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { Password, PasswordFilter, PasswordGeneratorOptions } from '../models/Password';
import { SecurityService } from './SecurityService';

const PASSWORDS_KEY = '@secure_vault:passwords';
const CATEGORIES_KEY = '@secure_vault:categories';

export class PasswordService {
  private static async encryptPassword(password: string): Promise<string> {
    // Usar a senha mestra como chave de criptografia
    const masterPassword = await SecurityService.getMasterPassword();
    if (!masterPassword) {
      throw new Error('Senha mestra não encontrada');
    }

    // Implementar criptografia AES-256
    // TODO: Implementar criptografia real
    return password;
  }

  private static async decryptPassword(encryptedPassword: string): Promise<string> {
    // Usar a senha mestra como chave de descriptografia
    const masterPassword = await SecurityService.getMasterPassword();
    if (!masterPassword) {
      throw new Error('Senha mestra não encontrada');
    }

    // Implementar descriptografia AES-256
    // TODO: Implementar descriptografia real
    return encryptedPassword;
  }

  static async savePassword(password: Password): Promise<void> {
    const passwords = await this.getAllPasswords();
    
    if (password.id) {
      // Atualizar senha existente
      const index = passwords.findIndex(p => p.id === password.id);
      if (index >= 0) {
        passwords[index] = {
          ...password,
          password: await this.encryptPassword(password.password),
          updatedAt: new Date()
        };
      }
    } else {
      // Nova senha
      passwords.push({
        ...password,
        id: Crypto.randomUUID(),
        password: await this.encryptPassword(password.password),
        createdAt: new Date(),
        updatedAt: new Date()
      });
    }

    await AsyncStorage.setItem(PASSWORDS_KEY, JSON.stringify(passwords));
  }

  static async getAllPasswords(): Promise<Password[]> {
    const data = await AsyncStorage.getItem(PASSWORDS_KEY);
    const passwords: Password[] = data ? JSON.parse(data) : [];
    
    // Descriptografar senhas
    return Promise.all(
      passwords.map(async p => ({
        ...p,
        password: await this.decryptPassword(p.password)
      }))
    );
  }

  static async getPassword(id: string): Promise<Password | null> {
    const passwords = await this.getAllPasswords();
    return passwords.find(p => p.id === id) || null;
  }

  static async deletePassword(id: string): Promise<void> {
    const passwords = await this.getAllPasswords();
    const filtered = passwords.filter(p => p.id !== id);
    await AsyncStorage.setItem(PASSWORDS_KEY, JSON.stringify(filtered));
  }

  static async filterPasswords(filter: PasswordFilter): Promise<Password[]> {
    let passwords = await this.getAllPasswords();

    // Aplicar filtros
    if (filter.search) {
      const searchLower = filter.search.toLowerCase();
      passwords = passwords.filter(p =>
        p.title.toLowerCase().includes(searchLower) ||
        p.username?.toLowerCase().includes(searchLower) ||
        p.url?.toLowerCase().includes(searchLower) ||
        p.notes?.toLowerCase().includes(searchLower)
      );
    }

    if (filter.category) {
      passwords = passwords.filter(p => p.category === filter.category);
    }

    if (filter.favoritesOnly) {
      passwords = passwords.filter(p => p.isFavorite);
    }

    // Aplicar ordenação
    if (filter.sortBy) {
      passwords.sort((a, b) => {
        let comparison = 0;
        switch (filter.sortBy) {
          case 'title':
            comparison = a.title.localeCompare(b.title);
            break;
          case 'createdAt':
            comparison = a.createdAt.getTime() - b.createdAt.getTime();
            break;
          case 'updatedAt':
            comparison = a.updatedAt.getTime() - b.updatedAt.getTime();
            break;
          case 'strength':
            comparison = a.strength - b.strength;
            break;
        }
        return filter.sortOrder === 'desc' ? -comparison : comparison;
      });
    }

    return passwords;
  }

  static generatePassword(options: PasswordGeneratorOptions): string {
    const upperChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lowerChars = 'abcdefghijklmnopqrstuvwxyz';
    const numbers = '0123456789';
    const symbols = '!@#$%^&*()_+-=[]{}|;:,.<>?';
    const ambiguous = 'l1IO0';
    const similar = 'iIlL1oO0';

    let chars = '';
    if (options.includeUppercase) chars += upperChars;
    if (options.includeLowercase) chars += lowerChars;
    if (options.includeNumbers) chars += numbers;
    if (options.includeSymbols) chars += symbols;

    if (options.excludeAmbiguous) {
      chars = chars.split('').filter(c => !ambiguous.includes(c)).join('');
    }

    if (options.excludeSimilar) {
      chars = chars.split('').filter(c => !similar.includes(c)).join('');
    }

    if (options.customExclude) {
      chars = chars.split('').filter(c => !options.customExclude?.includes(c)).join('');
    }

    if (chars.length === 0) {
      throw new Error('Nenhum caractere disponível com as opções selecionadas');
    }

    let password = '';
    const randomValues = new Uint32Array(options.length);
    crypto.getRandomValues(randomValues);
    
    for (let i = 0; i < options.length; i++) {
      password += chars[randomValues[i] % chars.length];
    }

    return password;
  }

  static async isPasswordCompromised(password: string): Promise<boolean> {
    try {
      // Implementar verificação de vazamento de senha
      // TODO: Integrar com serviço de verificação de vazamentos
      return false;
    } catch (error) {
      console.error('Erro ao verificar vazamento de senha:', error);
      return false;
    }
  }
} 