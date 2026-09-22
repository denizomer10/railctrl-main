/**
 * Astro Middleware - Yerel Sunucu Versiyonu
 * JWT tabanlı kimlik doğrulama
 */

import { defineMiddleware, sequence } from 'astro/middleware';
import { verifyToken, getUserById } from './lib/auth';

const STATIC_ASSET_EXTENSIONS = /\.(?:css|js|mjs|map|png|jpe?g|webp|gif|svg|ico|woff2?|ttf|otf|pdf|json|xml|txt)$/i;

function isStaticAssetPath(pathname: string): boolean {
  return (
    pathname.startsWith('/css/') ||
    pathname.startsWith('/js/') ||
    pathname.startsWith('/files/') ||
    pathname.startsWith('/vendor/') ||
    pathname.startsWith('/_astro/') ||
    pathname === '/sw.js' ||
    pathname === '/manifest.json' ||
    STATIC_ASSET_EXTENSIONS.test(pathname)
  );
}

// Public sayfalar (giriş gerektirmeyen)
const publicPages = ['/', '/login', '/403', '/404'];

// Public API rotaları
const publicApiRoutes = [
  '/api/auth/login',
  '/api/auth/logout',
  '/api/auth/refresh',
  '/api/health',
  '/api/mms',
  '/api/calisma-izni',
  '/api/notlar',
  '/api/dahili-numaralar',
];

// Sadece admin erişebilir
const adminOnlyApiRoutes = [
  '/api/auth/update-user-role',
  '/api/admin/',
];

// Şef veya admin gerektiren sayfalar
const sefOnlyPages = ['/sef-islemleri'];

/**
 * Güvenlik başlıkları middleware
 */
const securityHeaders = defineMiddleware(async (context, next) => {
  const response = await next();
  const pathname = context.url.pathname;

  // Güvenlik başlıkları
  response.headers.set('X-Frame-Options', 'SAMEORIGIN');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');

  // Route tipini belirle
  const isApi = pathname.startsWith('/api/');
  const isStaticAsset =
    isStaticAssetPath(pathname);
  const isHtmlRoute = !isApi && !pathname.includes('.');

  // HTML ve API yanitlari: cache kapali
  if (isApi || isHtmlRoute) {
    const existingVary = response.headers.get('Vary') || '';
    if (!existingVary.includes('Cookie')) {
      response.headers.set('Vary', (existingVary ? existingVary + ', ' : '') + 'Cookie');
    }

    response.headers.set('Cache-Control', 'private, no-store, no-cache, must-revalidate, max-age=0, s-maxage=0');
    response.headers.set('CDN-Cache-Control', 'no-store');
    response.headers.set('Surrogate-Control', 'no-store');
    response.headers.set('Pragma', 'no-cache');
    response.headers.set('Expires', '0');
    return response;
  }

  // Statik dosyalar: uzun sure cache (dosya ismi + versiyonla invalidation var)
  if (isStaticAsset) {
    if (pathname === '/sw.js') {
      response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
      response.headers.set('CDN-Cache-Control', 'no-store');
      response.headers.set('Pragma', 'no-cache');
      response.headers.set('Expires', '0');
      response.headers.delete('Vary');
      return response;
    }

    if (
      pathname === '/manifest.json' ||
      pathname.startsWith('/icons/') ||
      pathname === '/apple-touch-icon.png' ||
      pathname === '/apple-touch-icon-precomposed.png' ||
      pathname === '/apple-touch-icon-180x180.png' ||
      pathname === '/favicon.ico' ||
      pathname === '/favicon-32x32.png' ||
      pathname === '/favicon-16x16.png'
    ) {
      response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
      response.headers.set('CDN-Cache-Control', 'no-store');
      response.headers.set('Pragma', 'no-cache');
      response.headers.set('Expires', '0');
      if (pathname === '/manifest.json') {
        response.headers.set('Content-Type', 'application/manifest+json; charset=utf-8');
      }
      response.headers.delete('Vary');
      return response;
    }

    response.headers.set('Cache-Control', 'public, max-age=31536000, immutable');
    response.headers.set('CDN-Cache-Control', 'public, max-age=31536000, immutable');
    response.headers.delete('Pragma');
    response.headers.delete('Expires');
    response.headers.delete('Surrogate-Control');
    // Statik cevaplarda cookie'e gore vary yapmak cache hit oranini dusurur.
    response.headers.delete('Vary');
  }

  return response;
});

/**
 * Kimlik doğrulama middleware
 */
const authMiddleware = defineMiddleware(async (context, next) => {
  const { url, cookies, redirect } = context;
  const pathname = url.pathname;
  const method = context.request.method.toUpperCase();

  if (pathname === '/api/auth/logout' && method === 'POST') {
    cookies.delete('access-token', { path: '/' });
    cookies.delete('refresh-token', { path: '/' });

    return new Response(JSON.stringify({ message: 'Çıkış başarılı' }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  }

  // Public sayfa veya API kontrolü
  const isPublicPage = publicPages.includes(pathname);
  const isPublicApi = publicApiRoutes.some(route => pathname.startsWith(route));
  const isStaticAsset = isStaticAssetPath(pathname);

  // Statik dosyalar auth kontrolüne girmemeli.
  if (isStaticAsset) {
    return next();
  }

  // Token'ı cookie'den al
  const accessToken = cookies.get('access-token')?.value;

  // Token varsa doğrula ve kullanıcı bilgisini ekle
  if (accessToken) {
    const payload = verifyToken(accessToken);
    
    if (payload && payload.type === 'access') {
      // Kullanıcı bilgisini veritabanından doğrula.
      const user = await getUserById(payload.userId);
      if (user && user.isActive) {
        context.locals.user = {
          id: user.id,
          username: user.username,
          email: user.email,
          displayName: user.fullName,
          role: user.role,
          station: user.station || null,
        };
      } else {
        cookies.delete('access-token', { path: '/' });
        cookies.delete('refresh-token', { path: '/' });
      }
    } else {
      // Token geçersiz veya süresi dolmuş - cookie'yi temizle
      cookies.delete('access-token', { path: '/' });
      // Refresh token ile yenileme API'den yapılacak
    }
  }

  // Public sayfa/API ise devam et
  if (isPublicPage || isPublicApi) {
    // Giriş yapılmış ve login sayfasındaysa ana sayfaya yönlendir
    if (pathname === '/login' && context.locals.user) {
      return redirect('/');
    }
    
    const response = await next();
    
    // Giriş yapılmışsa cache'leme
    if (context.locals.user) {
      response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
      response.headers.set('Pragma', 'no-cache');
    }
    
    return response;
  }

  // Korunan sayfa/API - giriş gerekli
  if (!context.locals.user) {
    // API isteği ise JSON hata döndür
    if (pathname.startsWith('/api/')) {
      return new Response(JSON.stringify({ error: 'Giriş yapmanız gerekiyor' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    // Sayfa isteği ise login'e yönlendir
    return redirect('/login');
  }

  // Şef sayfaları kontrolü
  if (sefOnlyPages.some(p => pathname === p || pathname.startsWith(p + '/'))) {
    const role = context.locals.user.role;
    if (role !== 'sef' && role !== 'gar_mudur' && role !== 'admin') {
      console.warn(`Yetkisiz erişim denemesi: ${pathname}, rol: ${role}`);
      return redirect('/403');
    }
  }

  // Admin API rotaları kontrolü
  if (adminOnlyApiRoutes.some(route => pathname.startsWith(route))) {
    if (context.locals.user.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Admin yetkisi gerekli' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  // Devam et
  const response = await next();
  
  // Giriş yapılmışsa cache'leme
  response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  
  return response;
});

// Middleware'leri sırayla çalıştır
export const onRequest = sequence(securityHeaders, authMiddleware);
