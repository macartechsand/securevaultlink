import * as FileSystem from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';
import { cryptoService } from './CryptoService';

const BACKUP_DIRECTORY = `${FileSystem.documentDirectory}backups/`;
const BACKUP_META_KEY = '@secure_vault:backup_meta';

interface BackupMetadata {
  lastBackup: string | null;
  backupFiles: string[];
}

export class BackupService {
  private static instance: BackupService;
  private metadata: BackupMetadata = {
    lastBackup: null,
    backupFiles: []
  };

  private constructor() {}

  static getInstance(): BackupService {
    if (!BackupService.instance) {
      BackupService.instance = new BackupService();
    }
    return BackupService.instance;
  }

  async initialize(): Promise<void> {
    // Criar diretório de backup se não existir
    const dirInfo = await FileSystem.getInfoAsync(BACKUP_DIRECTORY);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(BACKUP_DIRECTORY, {
        intermediates: true
      });
    }

    // Carregar metadados
    const metaStr = await SecureStore.getItemAsync(BACKUP_META_KEY);
    if (metaStr) {
      this.metadata = JSON.parse(metaStr);
    }
  }

  async createBackup(data: any): Promise<string> {
    // Garantir que o diretório existe
    await this.initialize();

    // Criar nome do arquivo de backup
    const timestamp = new Date().toISOString();
    const filename = `backup_${timestamp.replace(/[:.]/g, '-')}.enc`;
    const filepath = `${BACKUP_DIRECTORY}${filename}`;

    try {
      // Encriptar dados
      const encryptedData = await cryptoService.encrypt(
        JSON.stringify(data)
      );

      // Salvar arquivo
      await FileSystem.writeAsStringAsync(filepath, encryptedData);

      // Atualizar metadados
      this.metadata.lastBackup = timestamp;
      this.metadata.backupFiles.push(filename);

      // Manter apenas os últimos 5 backups
      if (this.metadata.backupFiles.length > 5) {
        const oldestFile = this.metadata.backupFiles.shift();
        if (oldestFile) {
          await FileSystem.deleteAsync(
            `${BACKUP_DIRECTORY}${oldestFile}`,
            { idempotent: true }
          );
        }
      }

      // Salvar metadados
      await SecureStore.setItemAsync(
        BACKUP_META_KEY,
        JSON.stringify(this.metadata)
      );

      return filepath;
    } catch (error) {
      console.error('Erro ao criar backup:', error);
      throw new Error('Falha ao criar backup');
    }
  }

  async restoreBackup(filepath: string): Promise<any> {
    try {
      // Ler arquivo encriptado
      const encryptedData = await FileSystem.readAsStringAsync(filepath);

      // Decriptar dados
      const decryptedData = await cryptoService.decrypt(encryptedData);

      // Parsear dados
      return JSON.parse(decryptedData);
    } catch (error) {
      console.error('Erro ao restaurar backup:', error);
      throw new Error('Falha ao restaurar backup');
    }
  }

  async getBackupList(): Promise<{ filename: string; timestamp: string }[]> {
    return this.metadata.backupFiles.map(filename => ({
      filename,
      timestamp: filename
        .replace('backup_', '')
        .replace('.enc', '')
        .replace(/-/g, ':')
    }));
  }

  async deleteBackup(filename: string): Promise<void> {
    try {
      await FileSystem.deleteAsync(
        `${BACKUP_DIRECTORY}${filename}`,
        { idempotent: true }
      );

      // Atualizar metadados
      this.metadata.backupFiles = this.metadata.backupFiles.filter(
        f => f !== filename
      );

      if (this.metadata.backupFiles.length === 0) {
        this.metadata.lastBackup = null;
      }

      // Salvar metadados
      await SecureStore.setItemAsync(
        BACKUP_META_KEY,
        JSON.stringify(this.metadata)
      );
    } catch (error) {
      console.error('Erro ao deletar backup:', error);
      throw new Error('Falha ao deletar backup');
    }
  }

  async clearAllBackups(): Promise<void> {
    try {
      // Deletar todos os arquivos
      await FileSystem.deleteAsync(BACKUP_DIRECTORY, { idempotent: true });
      await this.initialize();

      // Resetar metadados
      this.metadata = {
        lastBackup: null,
        backupFiles: []
      };

      // Salvar metadados
      await SecureStore.setItemAsync(
        BACKUP_META_KEY,
        JSON.stringify(this.metadata)
      );
    } catch (error) {
      console.error('Erro ao limpar backups:', error);
      throw new Error('Falha ao limpar backups');
    }
  }
}

export const backupService = BackupService.getInstance(); 