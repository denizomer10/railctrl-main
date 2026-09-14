/**
 * MMS Tekil Kayıt API Endpoints
 * GET /api/mms/[id] - Kayıt detayı
 * PUT /api/mms/[id] - Kayıt güncelle
 * DELETE /api/mms/[id] - Kayıt sil
 */

import type { APIRoute } from 'astro';
import { query } from '../../../lib/database';
import { ensureAppSchema } from '../../../lib/schema';
import { createStationNotifications } from '../../../lib/notifications';
import { logAudit } from '../../../lib/audit';

export const prerender = false;

// Tekil kayıt getir
export const GET: APIRoute = async ({ params }) => {
  try {
    await ensureAppSchema();
    const { id } = params;

    const result = await query<any>(`SELECT * FROM mms_records WHERE id = $1`, [id]);

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
    console.error('MMS GET [id] error:', error);
    return new Response(JSON.stringify({ error: 'Kayıt alınırken hata oluştu' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

// Kayıt güncelle (user, sef veya admin)
export const PUT: APIRoute = async ({ params, request, locals }) => {
  // Yetki kontrolü
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
    const existing = await query<any>('SELECT * FROM mms_records WHERE id = $1', [id]);
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

    const allowedFields = ['mms_numarasi', 'ariza_tanimi', 'istasyon', 'durum', 'not'];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates.push(`${field === 'not' ? '"not"' : field} = $${paramIndex}`);
        values.push(field === 'not' ? (String(body[field] || '').trim() || null) : body[field]);
        paramIndex++;
      }
    }

    if (body.durum !== undefined) {
      updates.push(`onarilma_tarihi = ${body.durum === 'Onarıldı' ? 'CURRENT_TIMESTAMP' : 'NULL'}`);
    }

    if (updates.length === 0) {
      return new Response(JSON.stringify({ error: 'Güncellenecek alan bulunamadı' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    values.push(id);

    const result = await query<any>(`
      UPDATE mms_records 
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `, values);

    if (result.rows[0]?.istasyon) {
      await createStationNotifications(result.rows[0].istasyon, 'notify_mms', {
        category: 'mms',
        title: 'MMS Güncellendi',
        message: `${result.rows[0].istasyon} MMS ${result.rows[0].mms_numarasi || ''} kaydı güncellendi`,
        resourceType: 'mms_records',
        resourceId: result.rows[0].id,
        station: result.rows[0].istasyon,
        actorUserId: locals.user.id,
      });
    }

    await logAudit({
      userId: locals.user.id,
      action: 'mms.update',
      resourceType: 'mms_records',
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
    console.error('MMS PUT error:', error);
    return new Response(JSON.stringify({ error: 'Kayıt güncellenirken hata oluştu' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

// Kayıt sil (sef veya admin)
export const DELETE: APIRoute = async ({ params, locals }) => {
  // Yetki kontrolü
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

    const result = await query<any>('DELETE FROM mms_records WHERE id = $1 RETURNING id', [id]);

    if (result.rows.length === 0) {
      return new Response(JSON.stringify({ error: 'Kayıt bulunamadı' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    await logAudit({
      userId: locals.user.id,
      action: 'mms.delete',
      resourceType: 'mms_records',
      resourceId: id || null,
      details: {},
    });

    return new Response(JSON.stringify({ message: 'Kayıt silindi' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('MMS DELETE error:', error);
    return new Response(JSON.stringify({ error: 'Kayıt silinirken hata oluştu' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
