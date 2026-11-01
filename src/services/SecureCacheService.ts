import * as SecureStore from 'expo-secure-store';
import { cryptoService } from './CryptoService';

const CACHE_KEY_PREFIX = '@secure_vault:cache:';
const CACHE_META_KEY = '@secure_vault:cache_meta';
const DEFAULT_TTL = 5 * 60 * 1000; // 5 minutos
const CLEANUP_INTERVAL = 60 * 1000; // 1 minuto

interface CacheMetadata {
  keys: {
    [key: string]: {
      expiresAt: number;
      size: number;
    };
  };
  totalSize: number;
  lastCleanup: number;
}

interface CacheOptions {
  ttl?: number; // Time to live em milissegundos
  maxSize?: number; // Tamanho máximo em bytes
}

export class SecureCacheService {
  private static instance: SecureCacheService;
  private metadata: CacheMetadata = {
    keys: {},
    totalSize: 0,
    lastCleanup: Date.now()
  };
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  private constructor() {}

  static getInstance(): SecureCacheService {
    if (!SecureCacheService.instance) {
      SecureCacheService.instance = new SecureCacheService();
    }
    return SecureCacheService.instance;
  }

  async initialize(): Promise<void> {
    // Carregar metadados
    const metaStr = await SecureStore.getItemAsync(CACHE_META_KEY);
    if (metaStr) {
      this.metadata = JSON.parse(metaStr);
    }

    // Iniciar limpeza automática
    this.startCleanupTimer();
  }

  async set(
    key: string,
    value: any,
    options: CacheOptions = {}
  ): Promise<void> {
    const now = Date.now();
    const cacheKey = `${CACHE_KEY_PREFIX}${key}`;

    // Encriptar valor
    const encryptedValue = await cryptoService.encrypt(
      JSON.stringify(value)
    );

    // Calcular tamanho
    const size = new TextEncoder().encode(encryptedValue).length;

    // Verificar tamanho máximo
    if (options.maxSize && size > options.maxSize) {
      throw new Error('Valor excede o tamanho máximo permitido');
    }

    // Atualizar metadados
    this.metadata.keys[key] = {
      expiresAt: now + (options.ttl || DEFAULT_TTL),
      size
    };
    this.metadata.totalSize += size;

    // Salvar valor e metadados
    await Promise.all([
      SecureStore.setItemAsync(cacheKey, encryptedValue),
      this.saveMetadata()
    ]);

    // Executar limpeza se necessário
    if (now - this.metadata.lastCleanup > CLEANUP_INTERVAL) {
      await this.cleanup();
    }
  }

  async get<T>(key: string): Promise<T | null> {
    const now = Date.now();
    const cacheKey = `${CACHE_KEY_PREFIX}${key}`;

    // Verificar se existe e não expirou
    const meta = this.metadata.keys[key];
    if (!meta || now > meta.expiresAt) {
      if (meta) {
        await this.delete(key);
      }
      return null;
    }

    try {
      // Recuperar e decriptar valor
      const encryptedValue = await SecureStore.getItemAsync(cacheKey);
      if (!encryptedValue) {
        return null;
      }

      const decryptedValue = await cryptoService.decrypt(encryptedValue);
      return JSON.parse(decryptedValue) as T;
    } catch (error) {
      console.error('Erro ao recuperar valor do cache:', error);
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    const cacheKey = `${CACHE_KEY_PREFIX}${key}`;

    // Atualizar metadados
    if (this.metadata.keys[key]) {
      this.metadata.totalSize -= this.metadata.keys[key].size;
      delete this.metadata.keys[key];
    }

    // Remover valor e atualizar metadados
    await Promise.all([
      SecureStore.deleteItemAsync(cacheKey),
      this.saveMetadata()
    ]);
  }

  async clear(): Promise<void> {
    // Remover todos os valores
    await Promise.all(
      Object.keys(this.metadata.keys).map(key =>
        SecureStore.deleteItemAsync(`${CACHE_KEY_PREFIX}${key}`)
      )
    );

    // Resetar metadados
    this.metadata = {
      keys: {},
      totalSize: 0,
      lastCleanup: Date.now()
    };

    await this.saveMetadata();
  }

  private async cleanup(): Promise<void> {
    const now = Date.now();
    const expiredKeys = Object.keys(this.metadata.keys).filter(
      key => now > this.metadata.keys[key].expiresAt
    );

    // Remover valores expirados
    await Promise.all(
      expiredKeys.map(key => this.delete(key))
    );

    this.metadata.lastCleanup = now;
    await this.saveMetadata();
  }

  private async saveMetadata(): Promise<void> {
    await SecureStore.setItemAsync(
      CACHE_META_KEY,
      JSON.stringify(this.metadata)
    );
  }

  private startCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    this.cleanupTimer = setInterval(
      async () => {
        await this.cleanup();
      },
      CLEANUP_INTERVAL
    );
  }

  stopCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }
}

export const secureCacheService = SecureCacheService.getInstance(); 