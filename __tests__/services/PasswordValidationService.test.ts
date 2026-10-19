import { PasswordValidationService } from '../../app/services/PasswordValidationService';

describe('PasswordValidationService', () => {
  describe('validatePassword', () => {
    it('deve aceitar uma senha forte', () => {
      const result = PasswordValidationService.validatePassword('Teste123@#$');
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('deve rejeitar senha muito curta', () => {
      const result = PasswordValidationService.validatePassword('Abc@123');
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('A senha deve ter pelo menos 8 caracteres');
    });

    it('deve rejeitar senha sem letra maiúscula', () => {
      const result = PasswordValidationService.validatePassword('teste123@#$');
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('A senha deve conter pelo menos uma letra maiúscula');
    });

    it('deve rejeitar senha sem letra minúscula', () => {
      const result = PasswordValidationService.validatePassword('TESTE123@#$');
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('A senha deve conter pelo menos uma letra minúscula');
    });

    it('deve rejeitar senha sem número', () => {
      const result = PasswordValidationService.validatePassword('Teste@#$');
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('A senha deve conter pelo menos um número');
    });

    it('deve rejeitar senha sem caractere especial', () => {
      const result = PasswordValidationService.validatePassword('Teste123');
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('A senha deve conter pelo menos um caractere especial');
    });
  });

  describe('evaluatePassword', () => {
    it('deve avaliar senha forte corretamente', () => {
      const result = PasswordValidationService.evaluatePassword('Teste123@#$');
      expect(result.score).toBe(4);
      expect(result.feedback.warning).toBe('');
      expect(result.feedback.suggestions).toHaveLength(0);
    });

    it('deve avaliar senha fraca corretamente', () => {
      const result = PasswordValidationService.evaluatePassword('password123');
      expect(result.score).toBe(2);
      expect(result.feedback.warning).toBe('This is a common password');
      expect(result.feedback.suggestions).toContain('Add another word or two');
    });
  });

  describe('generateStrongPassword', () => {
    it('deve gerar senha com o comprimento especificado', () => {
      const password = PasswordValidationService.generateStrongPassword(20);
      expect(password.length).toBe(20);
    });

    it('deve gerar senha com todos os tipos de caracteres', () => {
      const password = PasswordValidationService.generateStrongPassword();
      expect(password).toMatch(/[A-Z]/);
      expect(password).toMatch(/[a-z]/);
      expect(password).toMatch(/[0-9]/);
      expect(password).toMatch(/[!@#$%^&*(),.?":{}|<>]/);
    });

    it('deve gerar senhas diferentes em chamadas consecutivas', () => {
      const password1 = PasswordValidationService.generateStrongPassword();
      const password2 = PasswordValidationService.generateStrongPassword();
      expect(password1).not.toBe(password2);
    });

    it('deve gerar senha que passa na validação', () => {
      const password = PasswordValidationService.generateStrongPassword();
      const validation = PasswordValidationService.validatePassword(password);
      expect(validation.isValid).toBe(true);
    });
  });
}); 