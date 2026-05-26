import { query } from './database';

let bootstrapped = false;

async function hasColumn(table: string, column: string): Promise<boolean> {
  const result = await query<{ name: string }>(`PRAGMA table_info(${table})`);
  return result.rows.some((row) => row.name === column);
}

async function addColumnIfMissing(table: string, column: string, definition: string): Promise<void> {
  if (await hasColumn(table, column)) return;
  await query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

export async function ensureAppSchema(): Promise<void> {
  if (bootstrapped) return;

  await addColumnIfMissing('users', 'istasyon', 'TEXT');
  await addColumnIfMissing('users', 'sicil_no', 'TEXT');
  await addColumnIfMissing('users', 'kky_no', 'TEXT');
  await addColumnIfMissing('users', 'bagli_birim', 'TEXT');
  await addColumnIfMissing('users', 'gorevi', 'TEXT');
  await addColumnIfMissing('users', 'notify_mms', 'INTEGER NOT NULL DEFAULT 1');
  await addColumnIfMissing('users', 'notify_calisma', 'INTEGER NOT NULL DEFAULT 1');
  await addColumnIfMissing('users', 'notify_vardiya', 'INTEGER NOT NULL DEFAULT 1');
  await addColumnIfMissing('users', 'notify_kayip_esya', 'INTEGER NOT NULL DEFAULT 1');

  await addColumnIfMissing('mms_records', 'acan_ad_soyad', 'TEXT');
  await addColumnIfMissing('mms_records', 'acilan_birim', 'TEXT');
  await addColumnIfMissing('mms_records', 'created_by', 'TEXT');

  await addColumnIfMissing('notlar', 'istasyon', 'TEXT');
  await addColumnIfMissing('notlar', 'hedef_roller', "TEXT DEFAULT '[]'");
  await addColumnIfMissing('notlar', 'created_by', 'TEXT');
  await addColumnIfMissing('notlar', 'medya', "TEXT DEFAULT '[]'");

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

  await query(`
    CREATE TABLE IF NOT EXISTS personel_kayitlari (
      id INTEGER PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE,
      ad_soyad TEXT NOT NULL,
      sicil_no TEXT NOT NULL,
      kky_no TEXT,
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
      sicil_no TEXT NOT NULL,
      kky_no TEXT,
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
      mesaj TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Yeni',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await query(`CREATE INDEX IF NOT EXISTS idx_geri_bildirimler_created ON geri_bildirimler(created_at DESC)`);

  await query(`
    CREATE TABLE IF NOT EXISTS vardiyalar (
      id INTEGER PRIMARY KEY,
      istasyon TEXT NOT NULL,
      yil INTEGER NOT NULL,
      ay INTEGER NOT NULL,
      week_shifts TEXT NOT NULL,
      personel TEXT NOT NULL DEFAULT '[]',
      created_by TEXT,
      updated_by TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Existing backup data may contain historical duplicates; keep this index non-unique in local SQLite.
  await query(`CREATE INDEX IF NOT EXISTS idx_vardiyalar_station_month_active ON vardiyalar (istasyon, yil, ay, is_active)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_vardiyalar_station ON vardiyalar(istasyon)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_vardiyalar_period ON vardiyalar(yil, ay)`);

  await query(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY,
      user_id TEXT,
      action TEXT NOT NULL,
      resource_type TEXT,
      resource_id TEXT,
      details TEXT,
      ip_address TEXT,
      user_agent TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action)`);

  bootstrapped = true;
}
