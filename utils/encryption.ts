import { Buffer } from 'buffer';
import * as Crypto from 'expo-crypto';
import CryptoJS from 'crypto-js';

export async function generateEncryptionKey(password: string, salt: string): Promise<string> {
  // Generate a key using PBKDF2
  const iterations = 100000;
  const keySize = 256 / 32; // 256 bits
  return CryptoJS.PBKDF2(password, salt, {
    keySize,
    iterations,
  }).toString();
}

export function encryptPassword(password: string, key: string): { 
  encryptedData: string;
  iv: string;
} {
  // Generate random IV
  const iv = CryptoJS.lib.WordArray.random(128 / 8);
  
  // Encrypt
  const encrypted = CryptoJS.AES.encrypt(password, key, {
    iv: iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7
  });

  return {
    encryptedData: encrypted.toString(),
    iv: iv.toString()
  };
}

export function decryptPassword(encryptedData: string, key: string, iv: string): string {
  // Decrypt
  const decrypted = CryptoJS.AES.decrypt(encryptedData, key, {
    iv: CryptoJS.enc.Hex.parse(iv),
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7
  });

  return decrypted.toString(CryptoJS.enc.Utf8);
}

export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    password
  );
  return hash;
}

export function generateSalt(): string {
  return CryptoJS.lib.WordArray.random(128 / 8).toString();
}