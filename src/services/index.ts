import { cryptoService } from './CryptoService';
import { hibpService } from './HIBPService';
import { backupService } from './BackupService';
import { securityLockService } from './SecurityLockService';
import { accessHistoryService } from './AccessHistoryService';
import { secureCacheService } from './SecureCacheService';
import { autofillService } from './AutofillService';

// Re-exportar serviços
export { cryptoService } from './CryptoService';
export { hibpService } from './HIBPService';
export { backupService } from './BackupService';
export { securityLockService } from './SecurityLockService';
export { accessHistoryService } from './AccessHistoryService';
export { secureCacheService } from './SecureCacheService';
export { autofillService } from './AutofillService';

// Tipos exportados
export type { BreachCheckResult } from './HIBPService';
export type { AccessHistoryEntry } from './AccessHistoryService';
export type { AutofillCredential } from './AutofillService';

// Inicialização dos serviços
export async function initializeServices(): Promise<void> {
  await Promise.all([
    cryptoService.initialize(),
    secureCacheService.initialize(),
    backupService.initialize(),
    securityLockService.initialize(),
    accessHistoryService.initialize()
  ]);
}

// Limpeza dos serviços
export async function cleanupServices(): Promise<void> {
  secureCacheService.stopCleanupTimer();
  await cryptoService.clearSensitiveData();
  await secureCacheService.clear();
} 