import { CryptoService } from '../../app/services/CryptoService';
import * as Crypto from 'expo-crypto';

describe('CryptoService', () => {
  const testPassword = 'senha123';
  const testData = 'dados sensíveis';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('encrypt e decrypt', () => {
    it('deve criptografar e descriptografar dados corretamente', async () => {
      const encrypted = await CryptoService.encrypt(testData, testPassword);
      expect(encrypted).toBeTruthy();
      expect(encrypted.includes(':')).toBeTruthy();

      const decrypted = await CryptoService.decrypt(encrypted, testPassword);
      expect(decrypted).toBe('decrypted-data');
    });

    it('deve falhar ao descriptografar com senha incorreta', async () => {
      const encrypted = await CryptoService.encrypt(testData, testPassword);
      await expect(CryptoService.decrypt(encrypted, 'senha_errada'))
        .rejects
        .toThrow('Falha ao descriptografar dados');
    });
  });

  describe('hashPassword e verifyPassword', () => {
    it('deve gerar e verificar hash de senha corretamente', async () => {
      const hash = await CryptoService.hashPassword(testPassword);
      expect(hash).toBeTruthy();
      expect(hash.includes(':')).toBeTruthy();

      const isValid = await CryptoService.verifyPassword(testPassword, hash);
      expect(isValid).toBe(true);
    });

    it('deve retornar falso para senha incorreta', async () => {
      const hash = await CryptoService.hashPassword(testPassword);
      const isValid = await CryptoService.verifyPassword('senha_errada', hash);
      expect(isValid).toBe(false);
    });
  });

  describe('segurança', () => {
    it('deve gerar hashes diferentes para a mesma senha', async () => {
      const hash1 = await CryptoService.hashPassword(testPassword);
      const hash2 = await CryptoService.hashPassword(testPassword);
      expect(hash1).not.toBe(hash2);
    });

    it('deve gerar criptografias diferentes para os mesmos dados', async () => {
      const encrypted1 = await CryptoService.encrypt(testData, testPassword);
      const encrypted2 = await CryptoService.encrypt(testData, testPassword);
      expect(encrypted1).not.toBe(encrypted2);
    });
  });
}); 