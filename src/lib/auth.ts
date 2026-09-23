/**
 * Yerel oturum doğrulaması ve bcrypt parola işlemleri
 */

import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { query, transaction, Tables } from './database';
import { hashString } from './encryption';
import { ensureAppSchema } from './schema';

// Tipler
export type UserRole = 'user' | 'sef' | 'gar_mudur' | 'admin';

export interface User {
  id: string;
  username: string;
  email: string;
  fullName: string;
  role: UserRole;
  station?: string | null;
  department?: string;
  phone?: string;
  isActive: boolean;
  lastLogin?: Date;
  createdAt: Date;
  updatedAt: Date;
}

interface SessionTokenPayload {
  userId: string;
  type: 'access' | 'refresh';
}

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

// Sabitler
const SALT_ROUNDS = 12;
const ACCESS_TOKEN_EXPIRY_SEC = 86400; // 1 gün (saniye)
const REFRESH_TOKEN_EXPIRY_SEC = 30 * 24 * 60 * 60; // 30 gün (saniye)
const TOKEN_PREFIX = 'rc1';

let sessionSigningKeyPromise: Promise<Buffer> | null = null;

async function loadOrCreateSessionSigningKey(): Promise<Buffer> {
  const configuredPath = process.env.RAILCTRL_SESSION_KEY_FILE;
  const keyPath = configuredPath
    ? path.resolve(configuredPath)
    : path.resolve(process.cwd(), '.astro', 'session.key');

  try {
    const existing = await readFile(keyPath);
    if (existing.length === 32) return existing;
    throw new Error(`Oturum anahtar dosyası 32 bayt olmalı: ${keyPath}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }

  const key = crypto.randomBytes(32);
  await mkdir(path.dirname(keyPath), { recursive: true });
  try {
    await writeFile(keyPath, key, { flag: 'wx', mode: 0o600 });
    return key;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    const existing = await readFile(keyPath);
    if (existing.length !== 32) throw new Error(`Oturum anahtar dosyası 32 bayt olmalı: ${keyPath}`);
    return existing;
  }
}

function getSessionSigningKey(): Promise<Buffer> {
  if (!sessionSigningKeyPromise) {
    sessionSigningKeyPromise = loadOrCreateSessionSigningKey().catch((error) => {
      sessionSigningKeyPromise = null;
      throw error;
    });
  }
  return sessionSigningKeyPromise;
}

async function createSessionToken(userId: string, type: SessionTokenPayload['type'], lifetimeSec: number): Promise<string> {
  const encodedPayload = Buffer.from(JSON.stringify({ userId, type })).toString('base64url');
  const nonce = crypto.randomBytes(32).toString('hex');
  const expiresAt = Math.floor(Date.now() / 1000) + lifetimeSec;
  const signedValue = `${TOKEN_PREFIX}.${encodedPayload}.${nonce}.${expiresAt}`;
  const signature = crypto.createHmac('sha256', await getSessionSigningKey()).update(signedValue).digest('hex');
  return `${signedValue}.${signature}`;
}

async function verifySessionToken(token: string): Promise<SessionTokenPayload | null> {
  const [prefix, encodedPayload, nonce, rawExpiresAt, signature, extra] = token.split('.');
  if (prefix !== TOKEN_PREFIX || !encodedPayload || !nonce || !rawExpiresAt || !signature || extra !== undefined) return null;

  try {
    const expiresAt = Number(rawExpiresAt);
    if (!Number.isSafeInteger(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) return null;

    const signedValue = `${prefix}.${encodedPayload}.${nonce}.${rawExpiresAt}`;
    const expected = crypto.createHmac('sha256', await getSessionSigningKey()).update(signedValue).digest();
    const actual = Buffer.from(signature, 'hex');
    if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;

    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as SessionTokenPayload;
    if (typeof payload.userId !== 'string' || (payload.type !== 'access' && payload.type !== 'refresh')) return null;
    return payload;
  } catch {
    return null;
  }
}

/**
 * Şifre hash'le
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Şifre doğrula
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Access token oluştur
 */
export function generateAccessToken(user: User): Promise<string> {
  return createSessionToken(user.id, 'access', ACCESS_TOKEN_EXPIRY_SEC);
}

/**
 * Refresh token oluştur
 */
export function generateRefreshToken(user: User): Promise<string> {
  return createSessionToken(user.id, 'refresh', REFRESH_TOKEN_EXPIRY_SEC);
}

/**
 * Token doğrula
 */
export function verifyToken(token: string): Promise<SessionTokenPayload | null> {
  return verifySessionToken(token);
}

/**
 * Kullanıcı girişi - username veya email ile
 * @param identifier - username (örn: "yasin") veya email (örn: "yasin@ornek.com")
 * @param password - kullanıcı şifresi
 */
export async function login(
  identifier: string, 
  password: string,
  ipAddress?: string,
  userAgent?: string
): Promise<{ user: User; tokens: AuthTokens } | null> {
  // Şema başlatılmamışsa başlat
  await ensureAppSchema();
  
  // identifier'ı normalize et (kurum alan adı dayatması yok)
  const normalizedIdentifier = identifier.toLowerCase().trim();

  // Username veya email ile kullanıcıyı bul
  const result = await query<any>(
    `SELECT * FROM ${Tables.USERS} WHERE (username = $1 OR email = $1) AND is_active = true`,
    [normalizedIdentifier]
  );
  
  if (result.rows.length === 0) {
    return null;
  }
  
  const userRow = result.rows[0];
  
  // Şifre kontrolü
  const isValid = await verifyPassword(password, userRow.password_hash);
  if (!isValid) {
    return null;
  }
  
  // User objesi oluştur
  const user: User = {
    id: userRow.id,
    username: userRow.username,
    email: userRow.email,
    fullName: userRow.full_name,
    role: userRow.role,
    station: userRow.istasyon,
    department: userRow.department,
    isActive: userRow.is_active,
    lastLogin: userRow.last_login,
    createdAt: userRow.created_at,
    updatedAt: userRow.updated_at,
  };
  
  // Token'ları oluştur
  const [accessToken, refreshToken] = await Promise.all([
    generateAccessToken(user),
    generateRefreshToken(user),
  ]);
  
  // Refresh token'ı veritabanına kaydet
  const refreshTokenHash = hashString(refreshToken);
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 gün
  
  await transaction(async (client) => {
    // Son giriş zamanını güncelle
    await client.query(
      `UPDATE ${Tables.USERS} SET last_login = CURRENT_TIMESTAMP WHERE id = $1`,
      [user.id]
    );
    
    // Refresh token kaydet
    await client.query(
      `INSERT INTO ${Tables.REFRESH_TOKENS} (id, user_id, token_hash, expires_at) VALUES ($1, $2, $3, $4)`,
      [crypto.randomUUID(), user.id, refreshTokenHash, expiresAt]
    );
    
    // Session kaydet
    await client.query(
      `INSERT INTO ${Tables.SESSIONS} (id, user_id, token_hash, ip_address, user_agent, expires_at) 
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [crypto.randomUUID(), user.id, hashString(accessToken), ipAddress, userAgent, new Date(Date.now() + ACCESS_TOKEN_EXPIRY_SEC * 1000)]
    );
  });
  
  return {
    user,
    tokens: {
      accessToken,
      refreshToken,
      expiresIn: ACCESS_TOKEN_EXPIRY_SEC,
    },
  };
}

/**
 * Token yenile
 */
export async function refreshTokens(refreshToken: string): Promise<AuthTokens | null> {
  // Şema başlatılmamışsa başlat
  await ensureAppSchema();
  
  // Token'ı doğrula
  const payload = await verifyToken(refreshToken);
  if (!payload || payload.type !== 'refresh') {
    return null;
  }
  
  // Veritabanında kontrol et
  const tokenHash = hashString(refreshToken);
  const result = await query<any>(
    `SELECT rt.*, u.* FROM ${Tables.REFRESH_TOKENS} rt
     JOIN ${Tables.USERS} u ON u.id = rt.user_id
     WHERE rt.token_hash = $1 AND rt.expires_at > CURRENT_TIMESTAMP AND u.is_active = true`,
    [tokenHash]
  );
  
  if (result.rows.length === 0) {
    return null;
  }
  
  const row = result.rows[0];
  
  const user: User = {
    id: row.user_id,
    username: row.username,
    email: row.email,
    fullName: row.full_name,
    role: row.role,
    station: row.istasyon,
    department: row.department,
    isActive: row.is_active,
    lastLogin: row.last_login,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  
  // Eski refresh token'ı sil
  await query(
    `DELETE FROM ${Tables.REFRESH_TOKENS} WHERE token_hash = $1`,
    [tokenHash]
  );
  
  // Yeni token'lar oluştur
  const [newAccessToken, newRefreshToken] = await Promise.all([
    generateAccessToken(user),
    generateRefreshToken(user),
  ]);
  
  // Yeni refresh token kaydet
  const newTokenHash = hashString(newRefreshToken);
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  
  await query(
    `INSERT INTO ${Tables.REFRESH_TOKENS} (id, user_id, token_hash, expires_at) VALUES ($1, $2, $3, $4)`,
    [crypto.randomUUID(), user.id, newTokenHash, expiresAt]
  );
  
  return {
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
    expiresIn: ACCESS_TOKEN_EXPIRY_SEC,
  };
}

/**
 * Çıkış yap - tüm token'ları geçersiz kıl
 */
export async function logout(userId: string, accessToken?: string): Promise<void> {
  await ensureAppSchema();
  
  await transaction(async (client) => {
    // Refresh token'ları sil
    await client.query(
      `DELETE FROM ${Tables.REFRESH_TOKENS} WHERE user_id = $1`,
      [userId]
    );
    
    // Session'ları sil
    if (accessToken) {
      await client.query(
        `DELETE FROM ${Tables.SESSIONS} WHERE user_id = $1 AND token_hash = $2`,
        [userId, hashString(accessToken)]
      );
    } else {
      await client.query(
        `DELETE FROM ${Tables.SESSIONS} WHERE user_id = $1`,
        [userId]
      );
    }
  });
}

/**
 * Kullanıcı bilgilerini getir
 */
export async function getUserById(userId: string): Promise<User | null> {
  await ensureAppSchema();
  
  const result = await query<any>(
    `SELECT * FROM ${Tables.USERS} WHERE id = $1`,
    [userId]
  );
  
  if (result.rows.length === 0) {
    return null;
  }
  
  const row = result.rows[0];
  
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    fullName: row.full_name,
    role: row.role,
    station: row.istasyon,
    department: row.department,
    isActive: row.is_active,
    lastLogin: row.last_login,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
