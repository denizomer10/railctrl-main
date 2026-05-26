/**
 * Dosya Yönetim Servisi
 * Şifreli dosya depolama ve erişim
 */

import { query, Tables } from './database';
import { encryptFile, decryptFile } from './encryption';

// Tipler
export interface FileCategory {
  id: string;
  name: string;
  slug: string;
  description?: string;
}

export interface FileRecord {
  id: string;
  categoryId?: string;
  categoryName?: string;
  name: string;
  originalName: string;
  mimeType: string;
  fileSize: number;
  checksum: string;
  metadata?: Record<string, any>;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Tüm kategorileri getir
 */
export async function getCategories(): Promise<FileCategory[]> {
  const result = await query<any>(
    `SELECT * FROM ${Tables.FILE_CATEGORIES} ORDER BY name`
  );

  return result.rows.map((row: any) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
  }));
}

/**
 * Kategori slug'ı ile ID bul
 */
export async function getCategoryBySlug(slug: string): Promise<FileCategory | null> {
  const result = await query<any>(
    `SELECT * FROM ${Tables.FILE_CATEGORIES} WHERE slug = $1`,
    [slug]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
  };
}

/**
 * Dosya kaydet (şifreli)
 */
export async function saveFile(
  content: Buffer,
  originalName: string,
  mimeType: string,
  categorySlug?: string,
  metadata?: Record<string, any>
): Promise<FileRecord> {
  // Kategori ID'sini bul
  let categoryId: string | null = null;
  if (categorySlug) {
    const category = await getCategoryBySlug(categorySlug);
    if (category) {
      categoryId = category.id;
    }
  }

  // Dosyayı şifrele
  const { encrypted, iv, checksum } = encryptFile(content);

  // Benzersiz isim oluştur
  const timestamp = Date.now();
  const extMatch = originalName.match(/(\.[^./\\]+)$/);
  const ext = extMatch ? extMatch[1] : '';
  const baseName = ext ? originalName.slice(0, -ext.length) : originalName;
  const safeName = `${baseName.replace(/[^a-zA-Z0-9_-]/g, '_')}_${timestamp}${ext}`;

  // Veritabanına kaydet
  const result = await query<any>(
    `INSERT INTO ${Tables.FILES} 
     (category_id, name, original_name, mime_type, file_size, content_encrypted, encryption_iv, checksum, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [categoryId, safeName, originalName, mimeType, content.length, encrypted, iv, checksum, JSON.stringify(metadata || {})]
  );

  const row = result.rows[0];

  return {
    id: row.id,
    categoryId: row.category_id,
    name: row.name,
    originalName: row.original_name,
    mimeType: row.mime_type,
    fileSize: row.file_size,
    checksum: row.checksum,
    metadata: row.metadata,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Dosya oku (şifresi çözülmüş)
 */
export async function getFile(fileId: string): Promise<{ file: FileRecord; content: Buffer } | null> {
  const result = await query<any>(
    `SELECT f.*, fc.name as category_name 
     FROM ${Tables.FILES} f
     LEFT JOIN ${Tables.FILE_CATEGORIES} fc ON fc.id = f.category_id
     WHERE f.id = $1 AND f.is_active = true`,
    [fileId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];

  // Dosyayı çöz
  const content = decryptFile(
    row.content_encrypted,
    row.encryption_iv,
    row.checksum
  );

  return {
    file: {
      id: row.id,
      categoryId: row.category_id,
      categoryName: row.category_name,
      name: row.name,
      originalName: row.original_name,
      mimeType: row.mime_type,
      fileSize: row.file_size,
      checksum: row.checksum,
      metadata: row.metadata,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    },
    content,
  };
}

/**
 * Dosya ismi ile getir
 */
export async function getFileByName(name: string): Promise<{ file: FileRecord; content: Buffer } | null> {
  const result = await query<any>(
    `SELECT f.*, fc.name as category_name 
     FROM ${Tables.FILES} f
     LEFT JOIN ${Tables.FILE_CATEGORIES} fc ON fc.id = f.category_id
     WHERE f.name = $1 AND f.is_active = true`,
    [name]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];

  const content = decryptFile(
    row.content_encrypted,
    row.encryption_iv,
    row.checksum
  );

  return {
    file: {
      id: row.id,
      categoryId: row.category_id,
      categoryName: row.category_name,
      name: row.name,
      originalName: row.original_name,
      mimeType: row.mime_type,
      fileSize: row.file_size,
      checksum: row.checksum,
      metadata: row.metadata,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    },
    content,
  };
}

/**
 * Kategoriye göre dosyaları listele
 */
export async function listFilesByCategory(categorySlug: string): Promise<FileRecord[]> {
  const result = await query<any>(
    `SELECT f.*, fc.name as category_name 
     FROM ${Tables.FILES} f
     JOIN ${Tables.FILE_CATEGORIES} fc ON fc.id = f.category_id
     WHERE fc.slug = $1 AND f.is_active = true
     ORDER BY f.original_name`,
    [categorySlug]
  );

  return result.rows.map((row: any) => ({
    id: row.id,
    categoryId: row.category_id,
    categoryName: row.category_name,
    name: row.name,
    originalName: row.original_name,
    mimeType: row.mime_type,
    fileSize: row.file_size,
    checksum: row.checksum,
    metadata: row.metadata,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

/**
 * Tüm dosyaları listele (metadata ile, içerik hariç)
 */
export async function listAllFiles(): Promise<FileRecord[]> {
  const result = await query<any>(
    `SELECT f.*, fc.name as category_name 
     FROM ${Tables.FILES} f
     LEFT JOIN ${Tables.FILE_CATEGORIES} fc ON fc.id = f.category_id
     WHERE f.is_active = true
     ORDER BY fc.name, f.original_name`
  );

  return result.rows.map((row: any) => ({
    id: row.id,
    categoryId: row.category_id,
    categoryName: row.category_name,
    name: row.name,
    originalName: row.original_name,
    mimeType: row.mime_type,
    fileSize: row.file_size,
    checksum: row.checksum,
    metadata: row.metadata,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

/**
 * Dosya sil (soft delete)
 */
export async function deleteFile(fileId: string): Promise<boolean> {
  const result = await query(
    `UPDATE ${Tables.FILES} SET is_active = false WHERE id = $1`,
    [fileId]
  );

  return (result.rowCount || 0) > 0;
}

/**
 * Public klasöründen dosyaları içe aktar
 */
export async function importFromPublicFolder(
  publicPath: string,
  categorySlug: string
): Promise<{ imported: number; errors: string[] }> {
  const errors: string[] = [];
  let imported = 0;

  try {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const files = await fs.readdir(publicPath);

    for (const fileName of files) {
      const filePath = path.join(publicPath, fileName);
      
      try {
        const stat = await fs.stat(filePath);
        
        if (!stat.isFile()) continue;

        // Dosya içeriğini oku
        const content = await fs.readFile(filePath);

        // MIME type belirle
        const ext = path.extname(fileName).toLowerCase();
        const mimeTypes: Record<string, string> = {
          '.webp': 'image/webp',
          '.png': 'image/png',
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.gif': 'image/gif',
          '.pdf': 'application/pdf',
          '.svg': 'image/svg+xml',
        };
        const mimeType = mimeTypes[ext] || 'application/octet-stream';

        // Kaydet
        await saveFile(content, fileName, mimeType, categorySlug);
        imported++;
        console.log(`✓ ${fileName}`);
      } catch (error: any) {
        errors.push(`${fileName}: ${error.message}`);
      }
    }
  } catch (error: any) {
    errors.push(`Klasör okuma hatası: ${error.message}`);
  }

  return { imported, errors };
}

// Default export
export default {
  getCategories,
  getCategoryBySlug,
  saveFile,
  getFile,
  getFileByName,
  listFilesByCategory,
  listAllFiles,
  deleteFile,
  importFromPublicFolder,
};
