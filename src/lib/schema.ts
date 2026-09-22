import { query } from './database';

let bootstrapped = false;

async function hasColumn(table: string, column: string): Promise<boolean> {
  const result = await query<{ name: string }>(`PRAGMA table_info(${table})`);
  return result.rows.some((row) => row.name === column);
}

async function addColumnIfMissing(table: string, column: string, definition: string): Promise<void> {
  if (await hasColumn(table, column.replaceAll('"', ''))) return;
  await query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

async function removeUnusedEmptyTables(): Promise<void> {
  for (const table of ['hakedis', 'izin_takip', 'kimlik_talep', 'periyodik_muayene']) {
    const tableExists = await query<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name = $1`,
      [table]
    );
    if (!tableExists.rows.length) continue;

    const count = await query<{ count: number }>(`SELECT COUNT(*) AS count FROM ${table}`);
    if (Number(count.rows[0]?.count || 0) === 0) {
      await query(`DROP TABLE ${table}`);
    }
  }
}

async function pruneDeprecatedUserColumns(): Promise<void> {
  const tables = ['users', 'personel_kayitlari', 'izin_istekleri'];

  for (const table of tables) {
    const info = await query<{ name: string; type: string | null; notnull: number; dflt_value: string | null; pk: number }>(`PRAGMA table_info(${table})`);
    if (!info.rows.length) continue;

    const deprecatedColumns = ['sicil_no', 'kky_no', 'bagli_birim'];
    for (const column of deprecatedColumns) {
      if (info.rows.some((row) => row.name === column)) {
        await query(`ALTER TABLE ${table} DROP COLUMN ${column}`);
      }
    }
  }
}

export async function ensureAppSchema(): Promise<void> {
  if (bootstrapped) return;

  await removeUnusedEmptyTables();
  await pruneDeprecatedUserColumns();

  // Core tables that must exist for auth and features
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      department TEXT,
      istasyon TEXT,
      gorevi TEXT,
      phone TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      notify_mms INTEGER NOT NULL DEFAULT 1,
      notify_calisma INTEGER NOT NULL DEFAULT 1,
      notify_vardiya INTEGER NOT NULL DEFAULT 1,
      notify_kayip_esya INTEGER NOT NULL DEFAULT 1,
      last_login TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active)`);

  await query(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at)`);

  await query(`
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires ON refresh_tokens(expires_at)`);

  await query(`
    CREATE TABLE IF NOT EXISTS file_categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      description TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY,
      category_id TEXT,
      name TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      content_encrypted BLOB NOT NULL,
      encryption_iv BLOB NOT NULL,
      checksum TEXT NOT NULL,
      metadata TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_files_category ON files(category_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_files_name ON files(name)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_files_active ON files(is_active)`);

  await query(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      action TEXT NOT NULL,
      entity_type TEXT,
      entity_id TEXT,
      old_data TEXT,
      new_data TEXT,
      ip_address TEXT,
      user_agent TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_user_created ON audit_logs(user_id, created_at DESC)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id)`);

  await query(`
    CREATE TABLE IF NOT EXISTS problem_records (
      id TEXT PRIMARY KEY,
      problem_no TEXT NOT NULL UNIQUE,
      baslik TEXT NOT NULL,
      aciklama TEXT,
      durum TEXT NOT NULL DEFAULT 'acik',
      oncelik TEXT NOT NULL DEFAULT 'normal',
      istasyon TEXT,
      acan_ad_soyad TEXT,
      acilan_birim TEXT,
      created_by TEXT,
      "not" TEXT,
      onarilma_tarihi TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_problem_records_no ON problem_records(problem_no)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_problem_records_durum ON problem_records(durum)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_problem_records_istasyon ON problem_records(istasyon)`);

  await query(`
    CREATE TABLE IF NOT EXISTS calisma_izinleri (
      id TEXT PRIMARY KEY,
      baslik TEXT NOT NULL,
      aciklama TEXT,
      baslangic_tarihi TEXT NOT NULL,
      bitis_tarihi TEXT NOT NULL,
      durum TEXT NOT NULL DEFAULT 'beklemede',
      istasyon TEXT,
      bildiren_ad_soyad TEXT,
      created_by TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_calisma_izinleri_durum ON calisma_izinleri(durum)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_calisma_izinleri_istasyon ON calisma_izinleri(istasyon)`);

  await query(`
    CREATE TABLE IF NOT EXISTS notlar (
      id TEXT PRIMARY KEY,
      baslik TEXT NOT NULL,
      icerik TEXT NOT NULL,
      istasyon TEXT,
      hedef_roller TEXT DEFAULT '[]',
      created_by TEXT,
      medya TEXT DEFAULT '[]',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_notlar_active ON notlar(is_active)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_notlar_istasyon ON notlar(istasyon)`);

  await query(`
    CREATE TABLE IF NOT EXISTS dahili_numaralar (
      id TEXT PRIMARY KEY,
      birim TEXT NOT NULL,
      ad_soyad TEXT NOT NULL,
      gorev TEXT,
      dahili_no TEXT NOT NULL,
      harici_no TEXT,
      email TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_dahili_numaralar_birim ON dahili_numaralar(birim)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_dahili_numaralar_active ON dahili_numaralar(is_active)`);

  await query(`
    CREATE TABLE IF NOT EXISTS personel_kayitlari (
      id INTEGER PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE,
      ad_soyad TEXT NOT NULL,
      birim TEXT NOT NULL,
      gorevi TEXT,
      unvan TEXT,
      telefon TEXT,
      izindeki_adres TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_personel_kayitlari_user_id ON personel_kayitlari(user_id)`);

  await query(`
    CREATE TABLE IF NOT EXISTS izin_istekleri (
      id INTEGER PRIMARY KEY,
      personel_id INTEGER,
      user_id TEXT NOT NULL,
      ad_soyad TEXT NOT NULL,
      birim TEXT NOT NULL,
      gorevi TEXT,
      ait_oldugu_yil INTEGER,
      izin_turu TEXT NOT NULL,
      baslangic_tarihi TEXT NOT NULL,
      bitis_tarihi TEXT NOT NULL,
      izin_gun_sayisi INTEGER NOT NULL,
      yol_izni INTEGER DEFAULT 0,
      kalan_izin INTEGER,
      is_basi_tarihi TEXT,
      aciklama TEXT,
      istem_tarihi TEXT DEFAULT CURRENT_DATE,
      izindeki_adres TEXT,
      durum TEXT DEFAULT 'beklemede',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_izin_istekleri_user_created ON izin_istekleri(user_id, created_at DESC)`);

  await query(`
    CREATE TABLE IF NOT EXISTS geri_bildirimler (
      id INTEGER PRIMARY KEY,
      user_id TEXT,
      full_name TEXT,
      station TEXT,
      category TEXT NOT NULL,
      message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_geri_bildirimler_status ON geri_bildirimler(status)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_geri_bildirimler_user_created ON geri_bildirimler(user_id, created_at DESC)`);

  await query(`
    CREATE TABLE IF NOT EXISTS vardiyalar (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      baslangic TEXT NOT NULL,
      bitis TEXT NOT NULL,
      tip TEXT NOT NULL,
      istasyon TEXT,
      aciklama TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_vardiyalar_user_created ON vardiyalar(user_id, created_at DESC)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_vardiyalar_istasyon ON vardiyalar(istasyon)`);

  await query(`
    CREATE TABLE IF NOT EXISTS kayip_esya (
      id TEXT PRIMARY KEY,
      esya_adi TEXT NOT NULL,
      aciklama TEXT,
      bulundu_yeri TEXT,
      tarih TEXT NOT NULL,
      durum TEXT NOT NULL DEFAULT 'kayip',
      bildiren_id TEXT,
      teslim_alan_id TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_kayip_esya_durum ON kayip_esya(durum)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_kayip_esya_tarih ON kayip_esya(tarih)`);

  await query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY,
      user_id TEXT,
      station TEXT,
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      resource_type TEXT,
      resource_id TEXT,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications(user_id, created_at DESC)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id, is_read)`);

  // Now add missing columns to existing tables (for migrations)
  await addColumnIfMissing('users', 'istasyon', 'TEXT');
  await addColumnIfMissing('users', 'gorevi', 'TEXT');
  await query(`
    UPDATE users
    SET role = CASE role
      WHEN 'Personel' THEN 'user'
      WHEN 'Şef' THEN 'sef'
      WHEN 'Gar Müdürü' THEN 'gar_mudur'
      WHEN 'Admin' THEN 'admin'
      ELSE role
    END
    WHERE role IN ('Personel', 'Şef', 'Gar Müdürü', 'Admin')
  `);
  await query(`UPDATE users SET gorevi = 'İstasyon Operasyon İşçisi' WHERE gorevi = 'İstasyon Operasyon Sorumlusu'`);
  await addColumnIfMissing('users', 'notify_mms', 'INTEGER NOT NULL DEFAULT 1');
  await addColumnIfMissing('users', 'notify_calisma', 'INTEGER NOT NULL DEFAULT 1');
  await addColumnIfMissing('users', 'notify_vardiya', 'INTEGER NOT NULL DEFAULT 1');
  await addColumnIfMissing('users', 'notify_kayip_esya', 'INTEGER NOT NULL DEFAULT 1');

  await addColumnIfMissing('problem_records', 'acan_ad_soyad', 'TEXT');
  await addColumnIfMissing('problem_records', 'acilan_birim', 'TEXT');
  await addColumnIfMissing('problem_records', 'created_by', 'TEXT');
  await addColumnIfMissing('calisma_izinleri', 'bildiren_ad_soyad', 'TEXT');
  await addColumnIfMissing('problem_records', '"not"', 'TEXT');
  await addColumnIfMissing('problem_records', 'onarilma_tarihi', 'TEXT');

  await addColumnIfMissing('notlar', 'istasyon', 'TEXT');
  await addColumnIfMissing('notlar', 'hedef_roller', "TEXT DEFAULT '[]'");
  await addColumnIfMissing('notlar', 'created_by', 'TEXT');
  await addColumnIfMissing('notlar', 'medya', "TEXT DEFAULT '[]'");

  bootstrapped = true;
}