import * as SecureStore from 'expo-secure-store';

const ATTEMPTS_KEY = '@secure_vault:login_attempts';
const LOCKOUT_KEY = '@secure_vault:lockout_until';
const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION = 5 * 60 * 1000; // 5 minutos
const ATTEMPT_RESET_TIME = 30 * 60 * 1000; // 30 minutos

interface LoginAttempts {
  count: number;
  firstAttempt: number;
}

export class SecurityLockService {
  private static instance: SecurityLockService;
  private attempts: LoginAttempts | null = null;
  private lockoutUntil: number | null = null;

  private constructor() {}

  static getInstance(): SecurityLockService {
    if (!SecurityLockService.instance) {
      SecurityLockService.instance = new SecurityLockService();
    }
    return SecurityLockService.instance;
  }

  async initialize(): Promise<void> {
    // Carregar tentativas anteriores
    const attemptsStr = await SecureStore.getItemAsync(ATTEMPTS_KEY);
    if (attemptsStr) {
      this.attempts = JSON.parse(attemptsStr);
    }

    // Carregar bloqueio
    const lockoutStr = await SecureStore.getItemAsync(LOCKOUT_KEY);
    if (lockoutStr) {
      this.lockoutUntil = parseInt(lockoutStr, 10);
    }
  }

  async recordLoginAttempt(success: boolean): Promise<void> {
    const now = Date.now();

    // Verificar se devemos resetar as tentativas
    if (this.attempts && (now - this.attempts.firstAttempt > ATTEMPT_RESET_TIME)) {
      this.attempts = null;
    }

    if (success) {
      // Limpar tentativas em caso de sucesso
      await this.clearAttempts();
      return;
    }

    // Inicializar ou atualizar tentativas
    if (!this.attempts) {
      this.attempts = {
        count: 1,
        firstAttempt: now
      };
    } else {
      this.attempts.count++;
    }

    // Verificar se deve bloquear
    if (this.attempts.count >= MAX_ATTEMPTS) {
      this.lockoutUntil = now + LOCKOUT_DURATION;
      await SecureStore.setItemAsync(
        LOCKOUT_KEY,
        this.lockoutUntil.toString()
      );
    }

    // Salvar tentativas
    await SecureStore.setItemAsync(
      ATTEMPTS_KEY,
      JSON.stringify(this.attempts)
    );
  }

  async isLocked(): Promise<boolean> {
    const now = Date.now();

    // Verificar bloqueio
    if (this.lockoutUntil && now < this.lockoutUntil) {
      return true;
    }

    // Limpar bloqueio expirado
    if (this.lockoutUntil && now >= this.lockoutUntil) {
      await this.clearLockout();
    }

    return false;
  }

  async getRemainingAttempts(): Promise<number> {
    if (!this.attempts) {
      return MAX_ATTEMPTS;
    }
    return Math.max(0, MAX_ATTEMPTS - this.attempts.count);
  }

  async getLockoutTimeRemaining(): Promise<number> {
    if (!this.lockoutUntil) {
      return 0;
    }
    const remaining = this.lockoutUntil - Date.now();
    return Math.max(0, remaining);
  }

  private async clearAttempts(): Promise<void> {
    this.attempts = null;
    await SecureStore.deleteItemAsync(ATTEMPTS_KEY);
  }

  private async clearLockout(): Promise<void> {
    this.lockoutUntil = null;
    await SecureStore.deleteItemAsync(LOCKOUT_KEY);
  }

  async reset(): Promise<void> {
    await this.clearAttempts();
    await this.clearLockout();
  }
}

export const securityLockService = SecurityLockService.getInstance(); 