import type { APIRoute } from 'astro';
import { query } from '../../../lib/database';
import { ensureAppSchema } from '../../../lib/schema';

export const prerender = false;

type AuditRow = {
  id: string;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  details: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
  user_name: string | null;
  user_email: string | null;
};

async function fetchAuditLogs(limit: number): Promise<AuditRow[]> {
  const result = await query<AuditRow>(
    `SELECT al.id, al.action, al.resource_type, al.resource_id, al.details, al.ip_address, al.user_agent, al.created_at,
            u.full_name as user_name, u.email as user_email
     FROM audit_logs al
     LEFT JOIN users u ON u.id = al.user_id
     ORDER BY al.created_at DESC
     LIMIT $1`,
    [limit]
  );

  return result.rows;
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '""';
  const escaped = String(value).replace(/"/g, '""');
  return `"${escaped}"`;
}

function xmlCell(value: unknown): string {
  const raw = value === null || value === undefined ? '' : String(value);
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export const GET: APIRoute = async ({ locals, url }) => {
  if (!locals.user || locals.user.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
  }

  try {
    await ensureAppSchema();
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '200', 10), 5000);
    const format = (url.searchParams.get('format') || 'json').toLowerCase();
    const logs = await fetchAuditLogs(limit);

    if (format === 'csv') {
      const header = ['id', 'created_at', 'user_name', 'user_email', 'action', 'resource_type', 'resource_id', 'ip_address', 'user_agent', 'details'];
      const lines = [header.join(',')];

      for (const row of logs) {
        lines.push([
          csvCell(row.id),
          csvCell(row.created_at),
          csvCell(row.user_name),
          csvCell(row.user_email),
          csvCell(row.action),
          csvCell(row.resource_type),
          csvCell(row.resource_id),
          csvCell(row.ip_address),
          csvCell(row.user_agent),
          csvCell(row.details ? JSON.stringify(row.details) : ''),
        ].join(','));
      }

      return new Response(lines.join('\n'), {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="audit-logs-${new Date().toISOString().slice(0, 10)}.csv"`,
          'Cache-Control': 'no-store',
        },
      });
    }

    if (format === 'excel') {
      const rows = logs.map((row) => `
        <Row>
          <Cell><Data ss:Type="String">${xmlCell(row.id)}</Data></Cell>
          <Cell><Data ss:Type="String">${xmlCell(row.created_at)}</Data></Cell>
          <Cell><Data ss:Type="String">${xmlCell(row.user_name)}</Data></Cell>
          <Cell><Data ss:Type="String">${xmlCell(row.user_email)}</Data></Cell>
          <Cell><Data ss:Type="String">${xmlCell(row.action)}</Data></Cell>
          <Cell><Data ss:Type="String">${xmlCell(row.resource_type)}</Data></Cell>
          <Cell><Data ss:Type="String">${xmlCell(row.resource_id)}</Data></Cell>
          <Cell><Data ss:Type="String">${xmlCell(row.ip_address)}</Data></Cell>
          <Cell><Data ss:Type="String">${xmlCell(row.user_agent)}</Data></Cell>
          <Cell><Data ss:Type="String">${xmlCell(row.details ? JSON.stringify(row.details) : '')}</Data></Cell>
        </Row>
      `).join('');

      const xml = `<?xml version="1.0"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Worksheet ss:Name="Audit Logs">
    <Table>
      <Row>
        <Cell><Data ss:Type="String">id</Data></Cell>
        <Cell><Data ss:Type="String">created_at</Data></Cell>
        <Cell><Data ss:Type="String">user_name</Data></Cell>
        <Cell><Data ss:Type="String">user_email</Data></Cell>
        <Cell><Data ss:Type="String">action</Data></Cell>
        <Cell><Data ss:Type="String">resource_type</Data></Cell>
        <Cell><Data ss:Type="String">resource_id</Data></Cell>
        <Cell><Data ss:Type="String">ip_address</Data></Cell>
        <Cell><Data ss:Type="String">user_agent</Data></Cell>
        <Cell><Data ss:Type="String">details</Data></Cell>
      </Row>
      ${rows}
    </Table>
  </Worksheet>
</Workbook>`;

      return new Response(xml, {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.ms-excel; charset=utf-8',
          'Content-Disposition': `attachment; filename="audit-logs-${new Date().toISOString().slice(0, 10)}.xls"`,
          'Cache-Control': 'no-store',
        },
      });
    }

    if (format === 'export') {
      return new Response(JSON.stringify({ exportedAt: new Date().toISOString(), count: logs.length, logs }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="audit-logs-${new Date().toISOString().slice(0, 10)}.json"`,
          'Cache-Control': 'no-store',
        },
      });
    }

    return new Response(JSON.stringify({ logs }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Audit logs GET error:', error);
    return new Response(JSON.stringify({ error: 'Audit kayıtları alınamadı' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};

export const DELETE: APIRoute = async ({ locals }) => {
  if (!locals.user || locals.user.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
  }

  try {
    await ensureAppSchema();
    await query('TRUNCATE TABLE audit_logs RESTART IDENTITY');

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Audit logs DELETE error:', error);
    return new Response(JSON.stringify({ error: 'Audit kayıtları temizlenemedi' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};
