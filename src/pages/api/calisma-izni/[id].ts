/**
 * Çalışma İzni Tekil Kayıt API Endpoints
 * GET /api/calisma-izni/[id] - Kayıt detayı
 * PUT /api/calisma-izni/[id] - Kayıt güncelle
 * DELETE /api/calisma-izni/[id] - Kayıt sil
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

    const result = await query<any>(`SELECT * FROM calisma_izinleri WHERE id = $1`, [id]);

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
    console.error('Çalışma İzni GET [id] error:', error);
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
    const existing = await query<any>('SELECT * FROM calisma_izinleri WHERE id = $1', [id]);
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

    const allowedFields = ['mms_numarasi', 'calisma_kodu', 'yapilacak_is', 'calisanlar', 'istasyon'];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates.push(`${field} = $${paramIndex}`);
        values.push(body[field]);
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
      UPDATE calisma_izinleri 
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `, values);

    if (result.rows[0]?.istasyon) {
      await createStationNotifications(result.rows[0].istasyon, 'notify_calisma', {
        category: 'calisma',
        title: 'Çalışma Kaydı Güncellendi',
        message: `${result.rows[0].istasyon} ${result.rows[0].calisma_kodu || ''} kodlu çalışma güncellendi`,
        resourceType: 'calisma_izinleri',
        resourceId: result.rows[0].id,
        station: result.rows[0].istasyon,
        actorUserId: locals.user.id,
      });
    }

    await logAudit({
      userId: locals.user.id,
      action: 'calisma.update',
      resourceType: 'calisma_izinleri',
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
    console.error('Çalışma İzni PUT error:', error);
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

    const result = await query<any>('DELETE FROM calisma_izinleri WHERE id = $1 RETURNING id', [id]);

    if (result.rows.length === 0) {
      return new Response(JSON.stringify({ error: 'Kayıt bulunamadı' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    await logAudit({
      userId: locals.user.id,
      action: 'calisma.delete',
      resourceType: 'calisma_izinleri',
      resourceId: id || null,
      details: {},
    });

    return new Response(JSON.stringify({ message: 'Kayıt silindi' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Çalışma İzni DELETE error:', error);
    return new Response(JSON.stringify({ error: 'Kayıt silinirken hata oluştu' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
