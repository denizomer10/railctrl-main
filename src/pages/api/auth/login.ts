/**
 * Login API Endpoint
 * POST /api/auth/login
 */

import type { APIRoute } from 'astro';
import { login } from '../../../lib/auth';

export const prerender = false;

// Rate limiting için basit in-memory store
const loginAttempts = new Map<string, { count: number; lastAttempt: number }>();
const MAX_ATTEMPTS = 5;
const BLOCK_DURATION = 15 * 60 * 1000; // 15 dakika

function checkRateLimit(ip: string): { allowed: boolean; retryAfterMs: number } {
  const now = Date.now();
  const attempts = loginAttempts.get(ip);

  if (!attempts) {
    loginAttempts.set(ip, { count: 1, lastAttempt: now });
    return { allowed: true, retryAfterMs: 0 };
  }

  if (now - attempts.lastAttempt > BLOCK_DURATION) {
    loginAttempts.set(ip, { count: 1, lastAttempt: now });
    return { allowed: true, retryAfterMs: 0 };
  }

  if (attempts.count >= MAX_ATTEMPTS) {
    const retryAfterMs = Math.max(BLOCK_DURATION - (now - attempts.lastAttempt), 0);
    return { allowed: false, retryAfterMs };
  }

  attempts.count++;
  attempts.lastAttempt = now;
  return { allowed: true, retryAfterMs: 0 };
}

export const POST: APIRoute = async ({ request, cookies, clientAddress }) => {
  try {
    const ip = clientAddress || 'unknown';
    const contentType = request.headers.get('content-type') || '';

    // Rate limit kontrolü
    const rateLimit = checkRateLimit(ip);
    if (!rateLimit.allowed) {
      const retryAfterSec = Math.ceil(rateLimit.retryAfterMs / 1000);
      return new Response(
        JSON.stringify({
          code: 'rate_limit',
          error: `Çok fazla basarisiz deneme. ${retryAfterSec} saniye sonra tekrar deneyin.`,
          retryAfter: retryAfterSec,
        }),
        {
          status: 429,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Request body'yi al - form data veya JSON desteklenir
    let identifier: string;
    let password: string;

    if (contentType.includes('application/json')) {
      let body: any;
      try {
        body = await request.json();
      } catch {
        return new Response(JSON.stringify({ code: 'invalid_json', error: 'Geçersiz JSON gövdesi' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      identifier = body.nickname || body.username;
      password = body.password;
    } else {
      const formData = await request.formData();
      identifier = (formData.get('nickname') as string) || (formData.get('username') as string);
      password = formData.get('password') as string;
    }

    if (!identifier || !password) {
      return new Response(
        JSON.stringify({
          code: 'missing_fields',
          error: 'Nickname ve şifre gerekli',
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const result = await login(
      identifier,
      password,
      ip,
      request.headers.get('user-agent') || undefined
    );

    if (!result) {
      return new Response(
        JSON.stringify({
          code: 'invalid_credentials',
          error: 'Nickname veya şifre hatalı',
        }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Basarili giris - rate limit'i sifirla
    loginAttempts.delete(ip);

    const isProduction = request.url.startsWith('https://');

    // JSON veya form fark etmeksizin cookie set et
    cookies.set('access-token', result.tokens.accessToken, {
      path: '/',
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      maxAge: result.tokens.expiresIn,
    });

    cookies.set('refresh-token', result.tokens.refreshToken, {
      path: '/',
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30, // 30 gün
    });

    if (contentType.includes('application/json')) {
      return new Response(
        JSON.stringify({
          user: {
            id: result.user.id,
            nickname: result.user.username,
            fullName: result.user.fullName,
            role: result.user.role,
          },
          message: 'Giris basarili',
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    return new Response(null, {
      status: 302,
      headers: {
        Location: '/',
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error: any) {
    console.error('Login error:', error);
    return new Response(
      JSON.stringify({
        code: 'unknown',
        error: 'Giris yapilirken bir hata olustu',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};
