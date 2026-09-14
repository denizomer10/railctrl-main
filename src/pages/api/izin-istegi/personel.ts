/**
 * Personel Kayıtları API
 * GET /api/izin-istegi/personel - Kullanıcının personel kaydını getir
 * POST /api/izin-istegi/personel - Personel kaydı oluştur/güncelle
 */

import type { APIRoute } from 'astro';
import { query } from '../../../lib/database';
import { logAudit } from '../../../lib/audit';
import { ensureAppSchema } from '../../../lib/schema';

export const prerender = false;

async function ensurePersonelTableShape(): Promise<void> {
  const info = await query<any>('PRAGMA table_info(personel_kayitlari)');
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
    await query('DROP TABLE IF EXISTS personel_kayitlari__new');
      await query(`
        CREATE TABLE personel_kayitlari__new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
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

      await query(`
        INSERT INTO personel_kayitlari__new (
          id, user_id, ad_soyad, birim, gorevi, unvan, telefon, izindeki_adres, created_at, updated_at
        )
        SELECT
          ${idExpr},
          ${col('user_id')},
          ${col('ad_soyad', "''")},
          ${col('birim', "''")},
          ${col('gorevi')},
          ${col('unvan')},
          ${col('telefon')},
          ${col('izindeki_adres')},
          COALESCE(${col('created_at')}, CURRENT_TIMESTAMP),
          COALESCE(${col('updated_at')}, CURRENT_TIMESTAMP)
        FROM personel_kayitlari
      `);

    await query('DROP TABLE personel_kayitlari');
    await query('ALTER TABLE personel_kayitlari__new RENAME TO personel_kayitlari');
    await query('CREATE INDEX IF NOT EXISTS idx_personel_kayitlari_user_id ON personel_kayitlari(user_id)');
    await query('COMMIT');
  } catch (error) {
    await query('ROLLBACK');
    throw error;
  }
}

// Kullanıcının personel kaydını getir
export const GET: APIRoute = async ({ locals }) => {
  try {
    await ensureAppSchema();
    await ensurePersonelTableShape();
    const user = locals.user;
    if (!user) {
      return new Response(JSON.stringify({ error: 'Oturum açmanız gerekiyor' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const result = await query<any>(
      `SELECT * FROM personel_kayitlari WHERE user_id = $1`,
      [user.id]
    );

    if (result.rows.length === 0) {
      const fromUser = await query<any>(
        `SELECT full_name, istasyon FROM users WHERE id = $1`,
        [user.id]
      );
      if (fromUser.rows.length > 0) {
        const u = fromUser.rows[0];
        const hasMasterData = Boolean(u.istasyon);
        if (hasMasterData) {
          return new Response(JSON.stringify({
            personel: {
              id: null,
              user_id: user.id,
              ad_soyad: u.full_name || user.displayName,
              birim: u.istasyon || '',
              gorevi: '',
              unvan: null,
              telefon: null,
              izindeki_adres: null,
            }
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      }
      return new Response(JSON.stringify({ personel: null }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ personel: result.rows[0] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Personel kayıt getirme hatası:', error);
    return new Response(JSON.stringify({ error: 'Sunucu hatası' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

// Personel kaydı oluştur veya güncelle
export const POST: APIRoute = async ({ request, locals }) => {
  try {
    await ensureAppSchema();
    await ensurePersonelTableShape();
    const user = locals.user;
    if (!user) {
      return new Response(JSON.stringify({ error: 'Oturum açmanız gerekiyor' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const body = await request.json();
    const { ad_soyad, birim, gorevi, unvan, telefon, izindeki_adres } = body;

    // Validasyon
    if (!ad_soyad || !birim || !gorevi) {
      return new Response(JSON.stringify({ error: 'Ad soyad, birim ve görevi zorunludur' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Mevcut kayıt var mı kontrol et
    const existing = await query<any>(
      `SELECT id FROM personel_kayitlari WHERE user_id = $1`,
      [user.id]
    );

    let result;
    if (existing.rows.length > 0) {
      // Güncelle
      result = await query<any>(
        `UPDATE personel_kayitlari 
         SET ad_soyad = $1, birim = $2, gorevi = $3, unvan = $4, telefon = $5, izindeki_adres = $6, updated_at = NOW()
         WHERE user_id = $7
         RETURNING *`,
        [ad_soyad, birim, gorevi, unvan || null, telefon || null, izindeki_adres || null, user.id]
      );
    } else {
      // Yeni kayıt
      result = await query<any>(
        `INSERT INTO personel_kayitlari (user_id, ad_soyad, birim, gorevi, unvan, telefon, izindeki_adres)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [user.id, ad_soyad, birim, gorevi, unvan || null, telefon || null, izindeki_adres || null]
      );
    }

    await logAudit({
      userId: user.id,
      action: existing.rows.length > 0 ? 'personel_kayitlari.update' : 'personel_kayitlari.create',
      resourceType: 'personel_kayitlari',
      resourceId: result.rows[0]?.id || null,
      details: {
        ad_soyad,
        birim,
        gorevi,
      },
      ipAddress: request.headers.get('x-forwarded-for'),
      userAgent: request.headers.get('user-agent'),
    });

    return new Response(JSON.stringify({ 
      success: true, 
      personel: result.rows[0],
      message: existing.rows.length > 0 ? 'Kayıt güncellendi' : 'Kayıt oluşturuldu'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Personel kayıt hatası:', error);
    return new Response(JSON.stringify({ error: 'Sunucu hatası' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

// Personel kaydını sil
export const DELETE: APIRoute = async ({ locals, request }) => {
  try {
    await ensureAppSchema();
    await ensurePersonelTableShape();
    const user = locals.user;
    if (!user) {
      return new Response(JSON.stringify({ error: 'Oturum açmanız gerekiyor' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const existing = await query<any>(
      `SELECT id, ad_soyad, birim, gorevi FROM personel_kayitlari WHERE user_id = $1`,
      [user.id]
    );

    await query(
      `DELETE FROM personel_kayitlari WHERE user_id = $1`,
      [user.id]
    );

    if (existing.rows.length > 0) {
      await logAudit({
        userId: user.id,
        action: 'personel_kayitlari.delete',
        resourceType: 'personel_kayitlari',
        resourceId: existing.rows[0]?.id || null,
        details: {
          ad_soyad: existing.rows[0]?.ad_soyad || null,
          birim: existing.rows[0]?.birim || null,
          gorevi: existing.rows[0]?.gorevi || null,
        },
        ipAddress: request.headers.get('x-forwarded-for'),
        userAgent: request.headers.get('user-agent'),
      });
    }

    return new Response(JSON.stringify({ 
      success: true, 
      message: 'Personel kaydı silindi'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Personel silme hatası:', error);
    return new Response(JSON.stringify({ error: 'Sunucu hatası' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
