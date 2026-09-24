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
      nickname: locals.user.nickname,
      displayName: locals.user.displayName,
      role: locals.user.role,
      gorevi: locals.user.gorevi || null,
      station: locals.user.station || null,
    }
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
};
