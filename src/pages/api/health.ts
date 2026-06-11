import type { APIRoute } from 'astro';
import { checkConnection } from '../../lib/database';

export const prerender = false;

export const GET: APIRoute = async () => {
  try {
    const dbConnected = await checkConnection();
    const status = dbConnected ? 'healthy' : 'unhealthy';
    const mode = typeof (globalThis as { WebSocketPair?: unknown }).WebSocketPair !== 'undefined' ? 'node' : 'node';

    return new Response(
      JSON.stringify({
        status,
        timestamp: new Date().toISOString(),
        services: {
          database: dbConnected ? 'connected' : 'disconnected',
        },
        version: '2.0.0',
        mode,
      }),
      {
        status: dbConnected ? 200 : 503,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({
        status: 'error',
        timestamp: new Date().toISOString(),
        error: error?.message || 'Unknown error',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};

