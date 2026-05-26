/**
 * Token Refresh API Endpoint
 * POST /api/auth/refresh
 */

import type { APIRoute } from 'astro';
import { refreshTokens } from '../../../lib/auth';

export const prerender = false;

export const POST: APIRoute = async ({ cookies, request }) => {
  try {
    const refreshToken = cookies.get('refresh-token')?.value;

    if (!refreshToken) {
      return new Response(JSON.stringify({ 
        error: 'Refresh token bulunamadı' 
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Token'ları yenile
    const tokens = await refreshTokens(refreshToken);

    if (!tokens) {
      // Geçersiz refresh token - cookie'leri temizle
      cookies.delete('access-token', { path: '/' });
      cookies.delete('refresh-token', { path: '/' });

      return new Response(JSON.stringify({ 
        error: 'Oturum süresi doldu, lütfen tekrar giriş yapın' 
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const isProduction = request.url.startsWith('https://');

    // Yeni access token cookie
    cookies.set('access-token', tokens.accessToken, {
      path: '/',
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      maxAge: tokens.expiresIn,
    });

    // Yeni refresh token cookie
    cookies.set('refresh-token', tokens.refreshToken, {
      path: '/',
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30, // 30 gün
    });

    return new Response(JSON.stringify({ 
      message: 'Token yenilendi' 
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Token refresh error:', error);
    return new Response(JSON.stringify({ 
      error: 'Token yenilenirken bir hata oluştu' 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
