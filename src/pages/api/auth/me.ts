/**
 * Kullanıcı Bilgisi API Endpoint
 * GET /api/auth/me - Mevcut kullanıcı bilgisini döndürür
 */

import type { APIRoute } from 'astro';

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user) {
    return new Response(JSON.stringify({ error: 'Giriş yapılmamış' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  return new Response(JSON.stringify({
    user: {
      id: locals.user.id,
      username: locals.user.username,
      email: locals.user.email,
      displayName: locals.user.displayName,
      role: locals.user.role,
      station: locals.user.station || null,
      sicilNo: locals.user.sicilNo || null,
      kkyNo: locals.user.kkyNo || null,
      bagliBirim: locals.user.bagliBirim || null,
    }
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
};
