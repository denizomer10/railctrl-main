/**
 * Kimlik Doğrulama Modülü
 * JWT + bcrypt tabanlı yerel auth sistemi
 */

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query, transaction, Tables } from './database';
import { hashString } from './encryption';
import { getEnvVar } from './runtime-env';

// Tipler
export type UserRole = 'user' | 'sef' | 'gar_mudur' | 'admin';

export interface User {
  id: string;
  username: string;
  email: string;
  fullName: string;
  role: UserRole;
  station?: string | null;
  sicilNo?: string | null;
  kkyNo?: string | null;
  bagliBirim?: string | null;
  department?: string;
  phone?: string;
  isActive: boolean;
  lastLogin?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface JWTPayload {
  userId: string;
  username: string;
  email: string;
  fullName: string;
  role: UserRole;
  type: 'access' | 'refresh';
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

// Sabitler
const SALT_ROUNDS = 12;
const ACCESS_TOKEN_EXPIRY = '1d';     // 1 gün
const REFRESH_TOKEN_EXPIRY = '30d';   // 30 gün
const ACCESS_TOKEN_EXPIRY_SEC = 86400;  // 1 gün (saniye)

/**
 * JWT secret key al
 */
function getJWTSecret(): string {
  const secret = getEnvVar('JWT_SECRET');
  if (!secret || secret.length < 32) {
    throw new Error('JWT_SECRET en az 32 karakter olmalı');
  }
  return secret;
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
export function generateAccessToken(user: User): string {
  const payload: JWTPayload = {
    userId: user.id,
    username: user.username,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    type: 'access',
  };
  
  return jwt.sign(payload, getJWTSecret(), {
    expiresIn: ACCESS_TOKEN_EXPIRY,
  });
}

/**
 * Refresh token oluştur
 */
export function generateRefreshToken(user: User): string {
  const payload: JWTPayload = {
    userId: user.id,
    username: user.username,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    type: 'refresh',
  };
  
  return jwt.sign(payload, getJWTSecret(), {
    expiresIn: REFRESH_TOKEN_EXPIRY,
  });
}

/**
 * Token doğrula
 */
export function verifyToken(token: string): JWTPayload | null {
  try {
    const decoded = jwt.verify(token, getJWTSecret()) as JWTPayload;
    return decoded;
  } catch (error) {
    return null;
  }
}

/**
 * Kullanıcı girişi - username veya email ile
 * @param identifier - username (örn: "yasin") veya email (örn: "yasin@tcdd.gov.tr")
 * @param password - kullanıcı şifresi
 */
export async function login(
  identifier: string, 
  password: string,
  ipAddress?: string,
  userAgent?: string
): Promise<{ user: User; tokens: AuthTokens } | null> {
  // identifier'ı normalize et: eğer @ içermiyorsa @tcdd.gov.tr ekle
  const normalizedIdentifier = identifier.includes('@') 
    ? identifier.toLowerCase().trim()
    : `${identifier.toLowerCase().trim()}@tcdd.gov.tr`;
  
  // Username veya email ile kullanıcıyı bul
  const result = await query<any>(
    `SELECT * FROM ${Tables.USERS} WHERE (username = $1 OR email = $2) AND is_active = true`,
    [identifier.toLowerCase().trim(), normalizedIdentifier]
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
    sicilNo: userRow.sicil_no,
    kkyNo: userRow.kky_no,
    bagliBirim: userRow.bagli_birim,
    department: userRow.department,
    isActive: userRow.is_active,
    lastLogin: userRow.last_login,
    createdAt: userRow.created_at,
    updatedAt: userRow.updated_at,
  };
  
  // Token'ları oluştur
  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);
  
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
  // Token'ı doğrula
  const payload = verifyToken(refreshToken);
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
    sicilNo: row.sicil_no,
    kkyNo: row.kky_no,
    bagliBirim: row.bagli_birim,
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
  const newAccessToken = generateAccessToken(user);
  const newRefreshToken = generateRefreshToken(user);
  
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
 * Kullanıcı oluştur
 */
export async function createUser(
  username: string,
  email: string,
  password: string,
  fullName: string,
  role: UserRole = 'user',
  department?: string
): Promise<User> {
  const passwordHash = await hashPassword(password);
  
  const result = await query<any>(
    `INSERT INTO ${Tables.USERS} (username, email, password_hash, full_name, role, department)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [username.toLowerCase(), email.toLowerCase(), passwordHash, fullName, role, department]
  );
  
  const row = result.rows[0];
  
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    fullName: row.full_name,
    role: row.role,
    station: row.istasyon,
    sicilNo: row.sicil_no,
    kkyNo: row.kky_no,
    bagliBirim: row.bagli_birim,
    department: row.department,
    isActive: row.is_active,
    lastLogin: row.last_login,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Kullanıcı bilgilerini getir
 */
export async function getUserById(userId: string): Promise<User | null> {
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
    sicilNo: row.sicil_no,
    kkyNo: row.kky_no,
    bagliBirim: row.bagli_birim,
    department: row.department,
    isActive: row.is_active,
    lastLogin: row.last_login,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Kullanıcı e-posta ile getir
 */
export async function getUserByEmail(email: string): Promise<User | null> {
  const result = await query<any>(
    `SELECT * FROM ${Tables.USERS} WHERE email = $1`,
    [email.toLowerCase()]
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
    sicilNo: row.sicil_no,
    kkyNo: row.kky_no,
    bagliBirim: row.bagli_birim,
    department: row.department,
    isActive: row.is_active,
    lastLogin: row.last_login,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Kullanıcı username ile getir
 */
export async function getUserByUsername(username: string): Promise<User | null> {
  const result = await query<any>(
    `SELECT * FROM ${Tables.USERS} WHERE username = $1`,
    [username.toLowerCase()]
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
    sicilNo: row.sicil_no,
    kkyNo: row.kky_no,
    bagliBirim: row.bagli_birim,
    department: row.department,
    isActive: row.is_active,
    lastLogin: row.last_login,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Kullanıcı rolünü güncelle (sadece admin)
 */
export async function updateUserRole(
  adminId: string,
  targetUserId: string,
  newRole: UserRole
): Promise<{ success: boolean; error?: string }> {
  // Admin kontrolü
  const admin = await getUserById(adminId);
  if (!admin || admin.role !== 'admin') {
    return { success: false, error: 'Yetkisiz işlem' };
  }
  
  await query(
    `UPDATE ${Tables.USERS} SET role = $1 WHERE id = $2`,
    [newRole, targetUserId]
  );
  
  return { success: true };
}

/**
 * Şifre değiştir
 */
export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string
): Promise<{ success: boolean; error?: string }> {
  // Mevcut şifreyi kontrol et
  const result = await query<any>(
    `SELECT password_hash FROM ${Tables.USERS} WHERE id = $1`,
    [userId]
  );
  
  if (result.rows.length === 0) {
    return { success: false, error: 'Kullanıcı bulunamadı' };
  }
  
  const isValid = await verifyPassword(currentPassword, result.rows[0].password_hash);
  if (!isValid) {
    return { success: false, error: 'Mevcut şifre hatalı' };
  }
  
  // Yeni şifreyi kaydet
  const newHash = await hashPassword(newPassword);
  await query(
    `UPDATE ${Tables.USERS} SET password_hash = $1 WHERE id = $2`,
    [newHash, userId]
  );
  
  // Tüm oturumları kapat (güvenlik için)
  await logout(userId);
  
  return { success: true };
}

/**
 * Tüm kullanıcıları listele (admin için)
 */
export async function listUsers(): Promise<User[]> {
  const result = await query<any>(
    `SELECT * FROM ${Tables.USERS} ORDER BY created_at DESC`
  );
  
  return result.rows.map((row: any) => ({
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
  }));
}

// Default export
export default {
  hashPassword,
  verifyPassword,
  generateAccessToken,
  generateRefreshToken,
  verifyToken,
  login,
  refreshTokens,
  logout,
  createUser,
  getUserById,
  getUserByEmail,
  updateUserRole,
  changePassword,
  listUsers,
};
