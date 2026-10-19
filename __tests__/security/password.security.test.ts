import { CryptoService } from '../../app/services/CryptoService';
import { PasswordValidationService } from '../../app/services/PasswordValidationService';

describe('Password Security Tests', () => {
  const testPassword = 'Teste123@#$';
  const weakPassword = 'password123';

  describe('Password Validation', () => {
    it('should validate password requirements', () => {
      const result = PasswordValidationService.validatePassword(testPassword);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect weak passwords', () => {
      const result = PasswordValidationService.evaluatePassword(weakPassword);
      expect(result.score).toBe(2);
      expect(result.feedback.warning).toBe('This is a common password');
    });

    it('should detect strong passwords', () => {
      const result = PasswordValidationService.evaluatePassword(testPassword);
      expect(result.score).toBe(4);
      expect(result.feedback.warning).toBe('');
    });
  });

  describe('Password Encryption', () => {
    it('should encrypt passwords securely', async () => {
      const encrypted = await CryptoService.encrypt(testPassword, 'masterKey');
      expect(encrypted).toBeTruthy();
      expect(encrypted.includes(':')).toBeTruthy();
    });

    it('should decrypt passwords correctly', async () => {
      const encrypted = await CryptoService.encrypt(testPassword, 'masterKey');
      const decrypted = await CryptoService.decrypt(encrypted, 'masterKey');
      expect(decrypted).toBe('decrypted-data');
    });

    it('should use different IVs for same password', async () => {
      const encrypted1 = await CryptoService.encrypt(testPassword, 'masterKey');
      const encrypted2 = await CryptoService.encrypt(testPassword, 'masterKey');
      expect(encrypted1).not.toBe(encrypted2);
    });
  });

  describe('Password Hashing', () => {
    it('should generate secure password hashes', async () => {
      const hash = await CryptoService.hashPassword(testPassword);
      expect(hash).toBeTruthy();
      expect(hash.includes(':')).toBeTruthy();
    });

    it('should verify password hashes correctly', async () => {
      const hash = await CryptoService.hashPassword(testPassword);
      const isValid = await CryptoService.verifyPassword(testPassword, hash);
      expect(isValid).toBe(true);
    });

    it('should use different salts for same password', async () => {
      const hash1 = await CryptoService.hashPassword(testPassword);
      const hash2 = await CryptoService.hashPassword(testPassword);
      expect(hash1).not.toBe(hash2);
    });
  });
}); 