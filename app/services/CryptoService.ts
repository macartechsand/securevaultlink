import CryptoJS from 'crypto-js';
import * as Crypto from 'expo-crypto';
import { getRandomBytes } from 'expo-crypto';

export class CryptoService {
  private static readonly ITERATION_COUNT = 100000;
  private static readonly KEY_SIZE = 256;
  private static readonly SALT_SIZE = 32;

  /**
   * Gera uma chave derivada usando PBKDF2
   */
  private static async deriveKey(password: string, salt: string): Promise<string> {
    const key = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      password + salt,
      {
        encoding: Crypto.CryptoEncoding.BASE64,
      }
    );
    return key;
  }

  /**
   * Criptografa dados usando AES-256
   */
  public static async encrypt(data: string, password: string): Promise<string> {
    try {
      const salt = await getRandomBytes(this.SALT_SIZE);
      const saltHex = Buffer.from(salt).toString('hex');
      const key = await this.deriveKey(password, saltHex);
      const encrypted = CryptoJS.AES.encrypt(data, key);
      return `${saltHex}:${encrypted}`;
    } catch (error) {
      console.error('Erro na criptografia:', error);
      throw new Error('Falha ao criptografar dados');
    }
  }

  /**
   * Descriptografa dados usando AES-256
   */
  public static async decrypt(encryptedData: string, password: string): Promise<string> {
    try {
      const [saltHex, data] = encryptedData.split(':');
      const key = await this.deriveKey(password, saltHex);
      const decrypted = CryptoJS.AES.decrypt(data, key);
      return decrypted.toString(CryptoJS.enc.Utf8);
    } catch (error) {
      console.error('Erro na descriptografia:', error);
      throw new Error('Falha ao descriptografar dados');
    }
  }

  /**
   * Gera um hash seguro da senha
   */
  public static async hashPassword(password: string): Promise<string> {
    const salt = await getRandomBytes(this.SALT_SIZE);
    const saltHex = Buffer.from(salt).toString('hex');
    const key = await this.deriveKey(password, saltHex);
    return `${saltHex}:${key}`;
  }

  /**
   * Verifica se a senha corresponde ao hash
   */
  public static async verifyPassword(password: string, hash: string): Promise<boolean> {
    try {
      const [saltHex, storedKey] = hash.split(':');
      const key = await this.deriveKey(password, saltHex);
      return key === storedKey;
    } catch (error) {
      console.error('Erro na verificação da senha:', error);
      return false;
    }
  }
} 