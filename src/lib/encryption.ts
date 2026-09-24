/**
 * AES-256-GCM Şifreleme Modülü
 * Dosyalar ve veriler için güvenli şifreleme
 */

import crypto from 'crypto';
import { getEnvVar } from './runtime-env';

// Şifreleme ayarları
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;       // 128 bit
const AUTH_TAG_LENGTH = 16; // 128 bit
const KEY_LENGTH = 32;      // 256 bit

/**
 * Şifreleme anahtarını al veya oluştur
 */
function getEncryptionKey(): Buffer {
  const keyString = getEnvVar('ENCRYPTION_KEY');
  
  if (!keyString) {
    throw new Error('ENCRYPTION_KEY ortam değişkeni tanımlı değil');
  }
  
  // Anahtar tam 32 karakter olmalı (256 bit)
  if (keyString.length === KEY_LENGTH) {
    return Buffer.from(keyString, 'utf8');
  }
  
  // Değilse hash'le
  return crypto.createHash('sha256').update(keyString).digest();
}

/**
 * Veriyi şifrele
 * @returns {encrypted: Buffer, iv: Buffer}
 */
export function encrypt(data: Buffer | string): { encrypted: Buffer; iv: Buffer } {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  const inputBuffer = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
  
  const encrypted = Buffer.concat([
    cipher.update(inputBuffer),
    cipher.final(),
    cipher.getAuthTag()
  ]);
  
  return { encrypted, iv };
}

/**
 * Şifreli veriyi çöz
 */
export function decrypt(encrypted: Buffer, iv: Buffer): Buffer {
  const key = getEncryptionKey();
  
  // Auth tag'i ayır (son 16 byte)
  const authTag = encrypted.subarray(-AUTH_TAG_LENGTH);
  const encryptedData = encrypted.subarray(0, -AUTH_TAG_LENGTH);
  
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  
  return Buffer.concat([
    decipher.update(encryptedData),
    decipher.final()
  ]);
}

/**
 * String'i şifrele
 */
export function encryptString(text: string): { encrypted: Buffer; iv: Buffer } {
  return encrypt(Buffer.from(text, 'utf8'));
}

/**
 * Şifreli string'i çöz
 */
export function decryptString(encrypted: Buffer, iv: Buffer): string {
  return decrypt(encrypted, iv).toString('utf8');
}

/**
 * JSON objesini şifrele
 */
export function encryptJSON(obj: any): { encrypted: Buffer; iv: Buffer } {
  const jsonString = JSON.stringify(obj);
  return encryptString(jsonString);
}

/**
 * Şifreli JSON'ı çöz
 */
export function decryptJSON<T = any>(encrypted: Buffer, iv: Buffer): T {
  const jsonString = decryptString(encrypted, iv);
  return JSON.parse(jsonString) as T;
}

/**
 * Dosya içeriğini şifrele
 */
export function encryptFile(fileContent: Buffer): { 
  encrypted: Buffer; 
  iv: Buffer; 
  checksum: string 
} {
  // Orijinal dosyanın checksum'ı
  const checksum = crypto.createHash('sha256').update(fileContent).digest('hex');
  
  const { encrypted, iv } = encrypt(fileContent);
  
  return { encrypted, iv, checksum };
}

/**
 * Şifreli dosyayı çöz ve doğrula
 */
export function decryptFile(
  encrypted: Buffer, 
  iv: Buffer, 
  expectedChecksum?: string
): Buffer {
  const decrypted = decrypt(encrypted, iv);
  
  // Checksum doğrulama (opsiyonel)
  if (expectedChecksum) {
    const actualChecksum = crypto.createHash('sha256').update(decrypted).digest('hex');
    if (actualChecksum !== expectedChecksum) {
      throw new Error('Dosya bütünlük kontrolü başarısız: Checksum uyuşmuyor');
    }
  }
  
  return decrypted;
}

/**
 * Rastgele güvenli token oluştur
 */
export function generateSecureToken(length: number = 32): string {
  return crypto.randomBytes(length).toString('hex');
}

/**
 * String'in hash'ini al (karşılaştırma için)
 */
export function hashString(str: string): string {
  return crypto.createHash('sha256').update(str).digest('hex');
}

/**
 * Checksum hesapla
 */
export function calculateChecksum(data: Buffer | string): string {
  const buffer = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

// Default export
export default {
  encrypt,
  decrypt,
  encryptString,
  decryptString,
  encryptJSON,
  decryptJSON,
  encryptFile,
  decryptFile,
  generateSecureToken,
  hashString,
  calculateChecksum,
};
