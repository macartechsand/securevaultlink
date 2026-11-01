import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { cryptoService } from './CryptoService';

const SHARE_KEY_PREFIX = '@secure_vault:share:';
const DEFAULT_EXPIRATION = 24 * 60 * 60 * 1000; // 24 horas

interface ShareData {
  password: string;
  expiresAt: number;
  accessCount: number;
  maxAccesses: number;
}

export interface ShareOptions {
  expirationTime?: number; // Em milissegundos
  maxAccesses?: number; // Número máximo de acessos
}

export class ShareService {
  private static instance: ShareService;

  private constructor() {}

  static getInstance(): ShareService {
    if (!ShareService.instance) {
      ShareService.instance = new ShareService();
    }
    return ShareService.instance;
  }

  async createShare(
    password: string,
    options: ShareOptions = {}
  ): Promise<string> {
    // Gerar ID único para o compartilhamento
    const shareId = await Crypto.randomUUID();
    
    // Configurar dados do compartilhamento
    const shareData: ShareData = {
      password: await cryptoService.encrypt(password),
      expiresAt: Date.now() + (options.expirationTime || DEFAULT_EXPIRATION),
      accessCount: 0,
      maxAccesses: options.maxAccesses || 1
    };

    // Salvar dados do compartilhamento
    await SecureStore.setItemAsync(
      `${SHARE_KEY_PREFIX}${shareId}`,
      JSON.stringify(shareData)
    );

    return shareId;
  }

  async getSharedPassword(shareId: string): Promise<string | null> {
    try {
      // Recuperar dados do compartilhamento
      const shareDataStr = await SecureStore.getItemAsync(
        `${SHARE_KEY_PREFIX}${shareId}`
      );

      if (!shareDataStr) {
        return null;
      }

      const shareData: ShareData = JSON.parse(shareDataStr);

      // Verificar expiração
      if (Date.now() > shareData.expiresAt) {
        await this.deleteShare(shareId);
        return null;
      }

      // Verificar número máximo de acessos
      if (shareData.accessCount >= shareData.maxAccesses) {
        await this.deleteShare(shareId);
        return null;
      }

      // Incrementar contador de acessos
      shareData.accessCount++;
      await SecureStore.setItemAsync(
        `${SHARE_KEY_PREFIX}${shareId}`,
        JSON.stringify(shareData)
      );

      // Decriptar e retornar senha
      return await cryptoService.decrypt(shareData.password);

    } catch (error) {
      console.error('Erro ao recuperar senha compartilhada:', error);
      return null;
    }
  }

  async deleteShare(shareId: string): Promise<void> {
    await SecureStore.deleteItemAsync(`${SHARE_KEY_PREFIX}${shareId}`);
  }

  async getShareInfo(shareId: string): Promise<{
    expiresAt: number;
    remainingAccesses: number;
    isValid: boolean;
  } | null> {
    try {
      const shareDataStr = await SecureStore.getItemAsync(
        `${SHARE_KEY_PREFIX}${shareId}`
      );

      if (!shareDataStr) {
        return null;
      }

      const shareData: ShareData = JSON.parse(shareDataStr);
      const now = Date.now();

      return {
        expiresAt: shareData.expiresAt,
        remainingAccesses: Math.max(
          0,
          shareData.maxAccesses - shareData.accessCount
        ),
        isValid:
          now <= shareData.expiresAt &&
          shareData.accessCount < shareData.maxAccesses
      };
    } catch (error) {
      console.error('Erro ao recuperar informações do compartilhamento:', error);
      return null;
    }
  }

  async cleanupExpiredShares(): Promise<void> {
    try {
      // Listar todas as chaves de compartilhamento
      const allKeys = await SecureStore.getItemAsync('_all_keys_');
      const shareKeys = allKeys ? 
        JSON.parse(allKeys)
          .filter((key: string) => key.startsWith(SHARE_KEY_PREFIX))
        : [];

      const now = Date.now();

      // Verificar e remover compartilhamentos expirados
      for (const key of shareKeys) {
        const shareDataStr = await SecureStore.getItemAsync(key);
        if (shareDataStr) {
          const shareData: ShareData = JSON.parse(shareDataStr);
          if (
            now > shareData.expiresAt ||
            shareData.accessCount >= shareData.maxAccesses
          ) {
            await SecureStore.deleteItemAsync(key);
          }
        }
      }
    } catch (error) {
      console.error('Erro ao limpar compartilhamentos expirados:', error);
    }
  }
}

export const shareService = ShareService.getInstance(); 