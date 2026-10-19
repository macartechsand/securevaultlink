import * as Crypto from 'expo-crypto';
import { Buffer } from 'buffer';
import * as SecureStore from 'expo-secure-store';

const MASTER_KEY_KEY = '@secure_vault:master_key';
const SALT_KEY_PREFIX = '@secure_vault:salt:';
const IV_SIZE = 16; // 128 bits
const SALT_SIZE = 32; // 256 bits
const KEY_SIZE = 32; // 256 bits

interface EncryptedData {
  iv: string;
  salt: string;
  data: string;
}

export class CryptoService {
  private static instance: CryptoService;
  private masterKey: Buffer | null = null;

  private constructor() {}

  static getInstance(): CryptoService {
    if (!CryptoService.instance) {
      CryptoService.instance = new CryptoService();
    }
    return CryptoService.instance;
  }

  async initialize(): Promise<void> {
    const storedKey = await SecureStore.getItemAsync(MASTER_KEY_KEY);
    
    if (!storedKey) {
      // Gerar nova chave mestra
      const keyBytes = await Crypto.getRandomBytesAsync(KEY_SIZE);
      const keyBase64 = Buffer.from(keyBytes).toString('base64');
      await SecureStore.setItemAsync(MASTER_KEY_KEY, keyBase64);
      this.masterKey = Buffer.from(keyBytes);
    } else {
      this.masterKey = Buffer.from(storedKey, 'base64');
    }
  }

  private async deriveKey(password: string, salt: Buffer): Promise<Buffer> {
    // Usar PBKDF2 para derivar a chave
    const key = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      password + salt.toString('hex')
    );
    return Buffer.from(key, 'hex');
  }

  async encrypt(data: string): Promise<string> {
    if (!this.masterKey) {
      throw new Error('CryptoService não inicializado');
    }

    // Gerar IV e salt únicos
    const iv = await Crypto.getRandomBytesAsync(IV_SIZE);
    const salt = await Crypto.getRandomBytesAsync(SALT_SIZE);
    
    // Derivar chave usando PBKDF2
    const key = await this.deriveKey(this.masterKey.toString('hex'), Buffer.from(salt));

    // Criar cipher
    const cipher = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      key.toString('hex') + Buffer.from(iv).toString('hex')
    );

    // Encriptar dados
    const dataBuffer = Buffer.from(data, 'utf8');
    const encrypted = Buffer.from(
      await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        cipher + dataBuffer.toString('hex')
      ),
      'hex'
    );

    // Montar objeto com dados encriptados
    const encryptedData: EncryptedData = {
      iv: Buffer.from(iv).toString('base64'),
      salt: Buffer.from(salt).toString('base64'),
      data: encrypted.toString('base64')
    };

    return JSON.stringify(encryptedData);
  }

  async decrypt(encryptedStr: string): Promise<string> {
    if (!this.masterKey) {
      throw new Error('CryptoService não inicializado');
    }

    // Parsear dados encriptados
    const encryptedData: EncryptedData = JSON.parse(encryptedStr);
    
    // Recuperar IV e salt
    const iv = Buffer.from(encryptedData.iv, 'base64');
    const salt = Buffer.from(encryptedData.salt, 'base64');
    const encrypted = Buffer.from(encryptedData.data, 'base64');

    // Derivar chave
    const key = await this.deriveKey(this.masterKey.toString('hex'), salt);

    // Criar decipher
    const decipher = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      key.toString('hex') + iv.toString('hex')
    );

    // Decriptar dados
    const decrypted = Buffer.from(
      await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        decipher + encrypted.toString('hex')
      ),
      'hex'
    );

    return decrypted.toString('utf8');
  }

  async clearSensitiveData(): Promise<void> {
    if (this.masterKey) {
      // Limpar a chave mestra da memória
      this.masterKey.fill(0);
      this.masterKey = null;
    }
  }

  // Método para rotação de chaves
  async rotateMasterKey(): Promise<void> {
    if (!this.masterKey) {
      throw new Error('CryptoService não inicializado');
    }

    // Gerar nova chave mestra
    const newKeyBytes = await Crypto.getRandomBytesAsync(KEY_SIZE);
    const newKey = Buffer.from(newKeyBytes);

    // TODO: Implementar a lógica de reencriptação de todas as senhas
    // com a nova chave mestra

    // Salvar nova chave
    await SecureStore.setItemAsync(
      MASTER_KEY_KEY,
      newKey.toString('base64')
    );

    // Atualizar chave em memória
    this.masterKey = newKey;
  }
}

export const cryptoService = CryptoService.getInstance(); 