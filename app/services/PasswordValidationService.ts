import zxcvbn from 'zxcvbn';

export interface PasswordStrength {
  score: number;
  feedback: {
    warning: string;
    suggestions: string[];
  };
  crackTimeSeconds: number;
  crackTimeDisplay: string;
}

export class PasswordValidationService {
  private static readonly MIN_LENGTH = 8;
  private static readonly MIN_SCORE = 3;

  /**
   * Avalia a força da senha
   */
  public static evaluatePassword(password: string): PasswordStrength {
    const result = zxcvbn(password);
    
    return {
      score: result.score,
      feedback: {
        warning: result.feedback.warning || '',
        suggestions: result.feedback.suggestions || []
      },
      crackTimeSeconds: Number(result.crack_times_seconds.online_no_throttling_10_per_second),
      crackTimeDisplay: String(result.crack_times_display.online_no_throttling_10_per_second)
    };
  }

  /**
   * Verifica se a senha atende aos requisitos mínimos
   */
  public static validatePassword(password: string): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!password || password.length < this.MIN_LENGTH) {
      errors.push(`A senha deve ter pelo menos ${this.MIN_LENGTH} caracteres`);
    }

    if (!/[A-Z]/.test(password)) {
      errors.push('A senha deve conter pelo menos uma letra maiúscula');
    }

    if (!/[a-z]/.test(password)) {
      errors.push('A senha deve conter pelo menos uma letra minúscula');
    }

    if (!/[0-9]/.test(password)) {
      errors.push('A senha deve conter pelo menos um número');
    }

    if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      errors.push('A senha deve conter pelo menos um caractere especial');
    }

    const strength = this.evaluatePassword(password);
    if (strength.score < this.MIN_SCORE) {
      errors.push('A senha é muito fraca ou comum');
      if (strength.feedback.warning) {
        errors.push(strength.feedback.warning);
      }
      errors.push(...strength.feedback.suggestions);
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Gera uma senha forte aleatória
   */
  public static generateStrongPassword(length: number = 16): string {
    const uppercaseChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lowercaseChars = 'abcdefghijklmnopqrstuvwxyz';
    const numberChars = '0123456789';
    const specialChars = '!@#$%^&*(),.?":{}|<>';
    
    const allChars = uppercaseChars + lowercaseChars + numberChars + specialChars;
    let password = '';

    // Garante pelo menos um caractere de cada tipo
    password += uppercaseChars[Math.floor(Math.random() * uppercaseChars.length)];
    password += lowercaseChars[Math.floor(Math.random() * lowercaseChars.length)];
    password += numberChars[Math.floor(Math.random() * numberChars.length)];
    password += specialChars[Math.floor(Math.random() * specialChars.length)];

    // Completa o resto da senha
    for (let i = password.length; i < length; i++) {
      password += allChars[Math.floor(Math.random() * allChars.length)];
    }

    // Embaralha a senha
    return password.split('').sort(() => Math.random() - 0.5).join('');
  }
} 