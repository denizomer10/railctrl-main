/**
 * İzin İstekleri API
 * GET /api/izin-istegi - Kullanıcının izin isteklerini listele
 * POST /api/izin-istegi - Yeni izin isteği oluştur
 */

import type { APIRoute } from 'astro';
import { query } from '../../../lib/database';
import { parsePagination } from '../../../lib/api';
import { logAudit } from '../../../lib/audit';
import { ensureAppSchema } from '../../../lib/schema';
import { Tables } from '../../../lib/database';

export const prerender = false;

const SABIT_BIRIM = '1/ V Trafik ve İstasyon Yönetim Müdürlüğü';

async function ensureIzinIstekleriTableShape(): Promise<void> {
  const info = await query<any>('PRAGMA table_info(izin_istekleri)');
  if (!info.rows.length) return;

  const idCol = info.rows.find((row: any) => row.name === 'id');
  const idLooksValid =
    Boolean(idCol) &&
    Number(idCol.pk) === 1 &&
    String(idCol.type || '').toUpperCase().includes('INT');
  if (idLooksValid) return;

  const columnNames = new Set(info.rows.map((row: any) => String(row.name)));
  const has = (name: string) => columnNames.has(name);
  const col = (name: string, fallback = 'NULL') => (has(name) ? name : fallback);
  const idExpr = has('id')
    ? "CASE WHEN id IS NULL OR TRIM(CAST(id AS TEXT)) = '' THEN NULL ELSE CAST(id AS INTEGER) END"
    : 'NULL';

  await query('BEGIN');
  try {
    await query('DROP TABLE IF EXISTS izin_istekleri__new');
    await query(`
      CREATE TABLE izin_istekleri__new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
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

    await query(`
      INSERT INTO izin_istekleri__new (
        id, personel_id, user_id, ad_soyad, birim, gorevi, ait_oldugu_yil,
        izin_turu, baslangic_tarihi, bitis_tarihi, izin_gun_sayisi, yol_izni, kalan_izin,
        is_basi_tarihi, aciklama, istem_tarihi, izindeki_adres, durum, created_at, updated_at
      )
      SELECT
        ${idExpr},
        ${col('personel_id')},
        ${col('user_id', "''")},
        ${col('ad_soyad', "''")},
        ${col('birim', "''")},
        ${col('gorevi')},
        ${col('ait_oldugu_yil')},
        ${col('izin_turu', "''")},
        ${col('baslangic_tarihi', "''")},
        ${col('bitis_tarihi', "''")},
        ${col('izin_gun_sayisi', '0')},
        COALESCE(${col('yol_izni')}, 0),
        ${col('kalan_izin')},
        ${col('is_basi_tarihi')},
        ${col('aciklama')},
        COALESCE(${col('istem_tarihi')}, CURRENT_DATE),
        ${col('izindeki_adres')},
        COALESCE(${col('durum')}, 'beklemede'),
        COALESCE(${col('created_at')}, CURRENT_TIMESTAMP),
        COALESCE(${col('updated_at')}, CURRENT_TIMESTAMP)
      FROM izin_istekleri
    `);

    await query('DROP TABLE izin_istekleri');
    await query('ALTER TABLE izin_istekleri__new RENAME TO izin_istekleri');
    await query('CREATE INDEX IF NOT EXISTS idx_izin_istekleri_user_created ON izin_istekleri(user_id, created_at DESC)');
    await query('COMMIT');
  } catch (error) {
    await query('ROLLBACK');
    throw error;
  }
}

// İzin isteklerini listele
export const GET: APIRoute = async ({ locals, url }) => {
  try {
    await ensureAppSchema();
    await ensureIzinIstekleriTableShape();
    const user = locals.user;
    if (!user) {
      return new Response(JSON.stringify({ error: 'Oturum açmanız gerekiyor' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const { page, limit, offset } = parsePagination(url, { page: 1, limit: 20 }, 100);

    // Şef veya admin ise tüm istekleri görebilir
    let queryText: string;
    let params: any[];

    if (user.role === 'yonetici') {
      queryText = `
        SELECT i.*, u.full_name as kullanici_adi
            FROM ${Tables.IZIN_ISTEKLERI} i
            LEFT JOIN ${Tables.USERS} u ON i.user_id = u.id
        ORDER BY i.created_at DESC
        LIMIT $1 OFFSET $2
      `;
      params = [limit, offset];
    } else {
      queryText = `
            SELECT * FROM ${Tables.IZIN_ISTEKLERI} 
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT $2 OFFSET $3
      `;
      params = [user.id, limit, offset];
    }

    const result = await query<any>(queryText, params);

    return new Response(JSON.stringify({ 
      istekler: result.rows,
      page,
      limit 
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('İzin isteği listeleme hatası:', error);
    return new Response(JSON.stringify({ error: 'Sunucu hatası' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

// Yeni izin isteği oluştur
export const POST: APIRoute = async ({ request, locals }) => {
  try {
    await ensureAppSchema();
    await ensureIzinIstekleriTableShape();
    const user = locals.user;
    if (!user) {
      return new Response(JSON.stringify({ error: 'Oturum açmanız gerekiyor' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const body = await request.json();
    const {
      personel_id,
      ad_soyad,
      birim,
      gorevi,
      izin_turu,
      baslangic_tarihi,
      bitis_tarihi,
      izin_gun_sayisi,
      yol_izni,
      kalan_izin,
      is_basi_tarihi,
      aciklama,
      izindeki_adres
    } = body;

    // Validasyon
    if (!ad_soyad || !birim || !izin_turu || !baslangic_tarihi || !bitis_tarihi || !izin_gun_sayisi) {
      return new Response(JSON.stringify({ error: 'Tüm zorunlu alanları doldurun' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // İzin türü kontrolü
    const validTypes = ['yillik', 'mazeret', 'hastalik', 'ucretsiz'];
    if (!validTypes.includes(izin_turu)) {
      return new Response(JSON.stringify({ error: 'Geçersiz izin türü' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Ait olduğu yılı başlangıç tarihinden al
    const aitOlduguYil = new Date(baslangic_tarihi).getFullYear();

    const result = await query<any>(
          `INSERT INTO ${Tables.IZIN_ISTEKLERI} (
        personel_id, user_id, ad_soyad, birim, gorevi,
        ait_oldugu_yil, izin_turu, baslangic_tarihi, bitis_tarihi, 
        izin_gun_sayisi, yol_izni, kalan_izin, is_basi_tarihi, aciklama,
        istem_tarihi, izindeki_adres, durum
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, CURRENT_DATE, $15, 'beklemede')
      RETURNING *`,
      [
        personel_id || null,
        user.id,
        ad_soyad,
        SABIT_BIRIM,
        String(gorevi || '').trim() || null,
        aitOlduguYil,
        izin_turu,
        baslangic_tarihi,
        bitis_tarihi,
        izin_gun_sayisi,
        yol_izni || 0,
        kalan_izin || null,
        is_basi_tarihi || null,
        aciklama || null,
        izindeki_adres || null
      ]
    );

    await logAudit({
      userId: user.id,
      action: 'izin_istegi.create',
      resourceType: 'izin_istekleri',
      resourceId: result.rows[0]?.id || null,
      details: {
        izin_turu,
        baslangic_tarihi,
        bitis_tarihi,
        birim: SABIT_BIRIM,
      },
      ipAddress: request.headers.get('x-forwarded-for'),
      userAgent: request.headers.get('user-agent'),
    });

    return new Response(JSON.stringify({
      success: true, 
      istek: result.rows[0],
      message: 'İzin isteği oluşturuldu'
    }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('İzin isteği oluşturma hatası:', error);
    return new Response(JSON.stringify({ error: 'Sunucu hatası' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
