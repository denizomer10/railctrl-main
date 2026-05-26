import { query } from './database';
import { ensureAppSchema } from './schema';

interface LogAuditParams {
  userId?: string | null;
  action: string;
  resourceType?: string | null;
  resourceId?: string | number | null;
  details?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

type AuditColumnMode = {
  resourceId: 'uuid' | 'text';
  ipAddress: 'inet' | 'text';
};

let cachedAuditColumnMode: AuditColumnMode | null = null;

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function getAuditColumnMode(): Promise<AuditColumnMode> {
  if (cachedAuditColumnMode) return cachedAuditColumnMode;
  // Local AstroDB/libSQL mode: keep all values as text-safe.
  cachedAuditColumnMode = {
    resourceId: 'text',
    ipAddress: 'text',
  };
  return cachedAuditColumnMode;
}

function normalizeIpAddress(raw: string | null | undefined, mode: 'inet' | 'text'): string | null {
  const base = String(raw || '').split(',')[0]?.trim() || '';
  if (!base) return null;
  if (mode === 'text') return base;

  const ipv4 = /^(25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)){3}$/;
  const ipv6 = /^(([0-9a-f]{1,4}:){1,7}[0-9a-f]{1,4}|::1)$/i;
  if (ipv4.test(base) || ipv6.test(base)) return base;
  return null;
}

export async function logAudit(params: LogAuditParams): Promise<void> {
  try {
    await ensureAppSchema();
    const mode = await getAuditColumnMode();

    const rawResourceId = params.resourceId ? String(params.resourceId) : null;
    const resourceId =
      mode.resourceId === 'uuid'
        ? (rawResourceId && isUuid(rawResourceId) ? rawResourceId : null)
        : rawResourceId;

    const details: Record<string, unknown> | null = params.details
      ? { ...params.details }
      : null;

    if (mode.resourceId === 'uuid' && rawResourceId && !resourceId) {
      if (details) details.resource_id_raw = rawResourceId;
    }

    const normalizedIp = normalizeIpAddress(params.ipAddress || null, mode.ipAddress);

    await query(
      `INSERT INTO audit_logs (id, user_id, action, resource_type, resource_id, details, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        crypto.randomUUID(),
        params.userId || null,
        params.action,
        params.resourceType || null,
        resourceId,
        details,
        normalizedIp,
        params.userAgent || null,
      ]
    );
  } catch (error) {
    console.error('Audit log error:', error);
  }
}
