/**
 * Dahili Numara Tekil Kayıt API Endpoints
 * PUT /api/dahili-numaralar/[id] - Kayıt güncelle
 * DELETE /api/dahili-numaralar/[id] - Kayıt sil
 */

import type { APIRoute } from 'astro';
import { query } from '../../../lib/database';
import { logAudit } from '../../../lib/audit';

export const prerender = false;

export const GET: APIRoute = async ({ params, locals }) => {
  if (!locals.user) {
    return new Response(JSON.stringify({ error: 'Yetkisiz erişim' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const id = params.id;
    const result = await query('SELECT * FROM dahili_numaralar WHERE id = $1', [id]);

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
    console.error('Dahili numara detay hatası:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

export const PUT: APIRoute = async ({ params, request, locals }) => {
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
    const id = params.id;
    const body = await request.json();
    const { dahili_numara, birim, aciklama } = body;

    const result = await query(
      `UPDATE dahili_numaralar 
       SET dahili_numara = $1, birim = $2, aciklama = $3
       WHERE id = $4
       RETURNING *`,
      [dahili_numara, birim, aciklama || null, id]
    );

    if (result.rows.length === 0) {
      return new Response(JSON.stringify({ error: 'Kayıt bulunamadı' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    await logAudit({
      userId: locals.user.id,
      action: 'dahili_numaralar.update',
      resourceType: 'dahili_numaralar',
      resourceId: id || null,
      details: {
        dahili_numara,
        birim,
        aciklama: aciklama || null,
      },
      ipAddress: request.headers.get('x-forwarded-for'),
      userAgent: request.headers.get('user-agent'),
    });

    return new Response(JSON.stringify({ record: result.rows[0] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error: any) {
    console.error('Dahili numara güncelleme hatası:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

export const DELETE: APIRoute = async ({ params, locals, request }) => {
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
    const id = params.id;

    const result = await query(
      'DELETE FROM dahili_numaralar WHERE id = $1 RETURNING id',
      [id]
    );

    if (result.rows.length === 0) {
      return new Response(JSON.stringify({ error: 'Kayıt bulunamadı' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    await logAudit({
      userId: locals.user.id,
      action: 'dahili_numaralar.delete',
      resourceType: 'dahili_numaralar',
      resourceId: id || null,
      details: {},
      ipAddress: request.headers.get('x-forwarded-for'),
      userAgent: request.headers.get('user-agent'),
    });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error: any) {
    console.error('Dahili numara silme hatası:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
