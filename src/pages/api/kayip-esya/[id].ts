/**
 * Kayıp Eşya Tekil Kayıt API Endpoints
 * GET /api/kayip-esya/[id] - Kayıt detayı
 * PUT /api/kayip-esya/[id] - Kayıt güncelle
 * DELETE /api/kayip-esya/[id] - Kayıt sil
 */

import type { APIRoute } from 'astro';
import { query } from '../../../lib/database';
import { ensureAppSchema } from '../../../lib/schema';
import { createGlobalNotifications } from '../../../lib/notifications';
import { logAudit } from '../../../lib/audit';

export const prerender = false;

// Tekil kayıt getir
export const GET: APIRoute = async ({ params, locals }) => {
  if (!locals.user) {
    return new Response(JSON.stringify({ error: 'Yetkisiz erişim' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    await ensureAppSchema();
    const { id } = params;

    const result = await query<any>(`SELECT * FROM kayip_esya WHERE id = $1`, [id]);

    if (result.rows.length === 0) {
      return new Response(JSON.stringify({ error: 'Kayıt bulunamadı' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ record: result.rows[0] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Kayıp Eşya GET [id] error:', error);
    return new Response(JSON.stringify({ error: 'Kayıt alınırken hata oluştu' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

// Kayıt güncelle (user, sef veya admin)
export const PUT: APIRoute = async ({ params, request, locals }) => {
  if (!locals.user) {
    return new Response(JSON.stringify({ error: 'Yetkisiz erişim' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (locals.user.role !== 'admin' && locals.user.role !== 'sef' && locals.user.role !== 'user') {
    return new Response(JSON.stringify({ error: 'Bu işlem için yetkiniz yok' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    await ensureAppSchema();
    const { id } = params;
    const body = await request.json();

    // Mevcut kaydı kontrol et
    const existing = await query<any>('SELECT * FROM kayip_esya WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return new Response(JSON.stringify({ error: 'Kayıt bulunamadı' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Güncelleme alanlarını oluştur
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    const allowedFields = [
      'tarih', 'belge_no', 'teslim_alan', 'buroya_teslim_eden',
      'buroya_teslim_tarihi', 'teslim_alan_buro_gorevlisi',
      'esya_tanimi', 'durumu', 'esya_sahibi_ad_soyad', 'esya_sahibi_tel'
    ];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates.push(`${field} = $${paramIndex}`);
        // Tarih alanları için dönüşüm
        if ((field === 'tarih' || field === 'buroya_teslim_tarihi') && body[field]) {
          values.push(new Date(body[field]));
        } else {
          values.push(body[field] || null);
        }
        paramIndex++;
      }
    }

    if (updates.length === 0) {
      return new Response(JSON.stringify({ error: 'Güncellenecek alan bulunamadı' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    values.push(id);

    const result = await query<any>(`
      UPDATE kayip_esya 
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `, values);

    await createGlobalNotifications({
      category: 'kayip-esya',
      title: 'Kayıp Eşya Güncellendi',
      message: `${result.rows[0].esya_tanimi || 'Kayıt'} güncellendi`,
      resourceType: 'kayip_esya',
      resourceId: result.rows[0].id,
    }, 'notify_kayip_esya');

    await logAudit({
      userId: locals.user.id,
      action: 'kayip_esya.update',
      resourceType: 'kayip_esya',
      resourceId: id || null,
      details: body,
      ipAddress: request.headers.get('x-forwarded-for'),
      userAgent: request.headers.get('user-agent'),
    });

    return new Response(JSON.stringify({
      message: 'Kayıt güncellendi',
      record: result.rows[0]
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Kayıp Eşya PUT error:', error);
    return new Response(JSON.stringify({ error: 'Kayıt güncellenirken hata oluştu' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

// Kayıt sil (sef veya admin)
export const DELETE: APIRoute = async ({ params, locals }) => {
  if (!locals.user) {
    return new Response(JSON.stringify({ error: 'Yetkisiz erişim' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (locals.user.role !== 'admin' && locals.user.role !== 'sef') {
    return new Response(JSON.stringify({ error: 'Bu işlem için yetkiniz yok' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    await ensureAppSchema();
    const { id } = params;

    const result = await query<any>('DELETE FROM kayip_esya WHERE id = $1 RETURNING id', [id]);

    if (result.rows.length === 0) {
      return new Response(JSON.stringify({ error: 'Kayıt bulunamadı' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    await logAudit({
      userId: locals.user.id,
      action: 'kayip_esya.delete',
      resourceType: 'kayip_esya',
      resourceId: id || null,
      details: {},
    });

    return new Response(JSON.stringify({ message: 'Kayıt silindi' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Kayıp Eşya DELETE error:', error);
    return new Response(JSON.stringify({ error: 'Kayıt silinirken hata oluştu' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
