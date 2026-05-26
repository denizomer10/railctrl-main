/**
 * Files API Endpoint
 * GET /api/files/[name]
 * 
 * Şifreli dosyaları çözerek döndürür
 */

import type { APIRoute } from 'astro';
import { getFileByName } from '../../../lib/files';

export const prerender = false;

export const GET: APIRoute = async ({ params, locals }) => {
  // Auth kontrolü
  if (!locals.user) {
    return new Response(JSON.stringify({ 
      error: 'Giriş yapmanız gerekiyor' 
    }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const fileName = params.name;
  
  if (!fileName) {
    return new Response(JSON.stringify({ 
      error: 'Dosya ismi gerekli' 
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    // Dosyayı al (şifresi çözülmüş)
    const result = await getFileByName(decodeURIComponent(fileName));
    
    if (!result) {
      return new Response(JSON.stringify({ 
        error: 'Dosya bulunamadı' 
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const { file, content } = result;

    // Buffer'ı Uint8Array'e çevir
    const body = new Uint8Array(content);

    // Dosyayı döndür
    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': file.mimeType,
        'Content-Length': content.length.toString(),
        'Content-Disposition': `inline; filename="${file.originalName}"`,
        'Cache-Control': 'private, max-age=3600', // 1 saat cache
        'X-File-Id': file.id,
        'X-File-Checksum': file.checksum,
      }
    });

  } catch (error: any) {
    console.error('File retrieval error:', error);
    return new Response(JSON.stringify({ 
      error: 'Dosya alınırken bir hata oluştu',
      details: error.message 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
