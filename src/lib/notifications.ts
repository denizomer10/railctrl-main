import { query } from './database';
import { ensureAppSchema } from './schema';

interface NotificationInput {
  category: 'mms' | 'calisma' | 'kayip-esya' | 'sistem' | 'vardiya';
  title: string;
  message: string;
  resourceType?: string;
  resourceId?: string | number;
  station?: string | null;
  actorUserId?: string | null;
}

export async function createStationNotifications(
  station: string,
  preferenceColumn: 'notify_mms' | 'notify_calisma' | 'notify_vardiya',
  payload: NotificationInput
): Promise<void> {
  if (!station) return;
  await ensureAppSchema();

  await query(
    `INSERT INTO notifications (user_id, station, category, title, message, resource_type, resource_id)
     SELECT id, $1::varchar(100), $3, $4, $5, $6, $7
     FROM users
     WHERE LOWER(COALESCE(CAST(is_active AS TEXT), '')) IN ('1', 'true', 't')
       AND (istasyon::text = $2::text OR id = $8::uuid)
       AND LOWER(COALESCE(CAST(${preferenceColumn} AS TEXT), '')) IN ('1', 'true', 't')`,
    [
      station,
      station,
      payload.category,
      payload.title,
      payload.message,
      payload.resourceType || null,
      payload.resourceId ? String(payload.resourceId) : null,
      payload.actorUserId || null,
    ]
  );
}

export async function createGlobalNotifications(
  payload: NotificationInput,
  preferenceColumn?: 'notify_mms' | 'notify_calisma' | 'notify_vardiya' | 'notify_kayip_esya'
): Promise<void> {
  await ensureAppSchema();
  const preferenceFilter = preferenceColumn
    ? ` AND LOWER(COALESCE(CAST(${preferenceColumn} AS TEXT), '')) IN ('1', 'true', 't')`
    : '';
  await query(
    `INSERT INTO notifications (user_id, station, category, title, message, resource_type, resource_id)
     SELECT id, $1::varchar(100), $2, $3, $4, $5, $6
     FROM users
     WHERE LOWER(COALESCE(CAST(is_active AS TEXT), '')) IN ('1', 'true', 't')${preferenceFilter}`,
    [
      payload.station || null,
      payload.category,
      payload.title,
      payload.message,
      payload.resourceType || null,
      payload.resourceId ? String(payload.resourceId) : null,
    ]
  );
}
