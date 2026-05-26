/**
 * Logout API Endpoint
 * POST /api/auth/logout
 */

import type { APIRoute } from 'astro';
import { logout } from '../../../lib/auth';

export const prerender = false;

export const POST: APIRoute = async ({ cookies, locals }) => {
  const userId = locals.user?.id;
  const accessToken = cookies.get('access-token')?.value;

  // Cikis deneyimi bozulmasin diye önce cookie'leri temizleyip basari don.
  cookies.delete('access-token', { path: '/' });
  cookies.delete('refresh-token', { path: '/' });

  // Veritabani temizligini best-effort arka planda yap.
  if (userId) {
    void logout(userId, accessToken).catch((error) => {
      console.error('Logout background cleanup error:', error);
    });
  }

  return new Response(JSON.stringify({ 
    message: 'Çıkış başarılı' 
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
};
