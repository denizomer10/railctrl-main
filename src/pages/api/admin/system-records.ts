import type { APIRoute } from 'astro';
import { query } from '../../../lib/database';
import { ensureAppSchema } from '../../../lib/schema';
import { parsePagination } from '../../../lib/api';

export const prerender = false;

type SystemRecordRow = {
  module_key: string;
  module_label: string;
  record_id: string;
  record_title: string;
  location: string | null;
  created_at: string;
  creator_name: string | null;
  creator_email: string | null;
  details: Record<string, unknown> | null;
};

function normalizeDetails(value: unknown): Record<string, unknown> | null {
  if (!value) return null;
  if (typeof value === 'object') return value as Record<string, unknown>;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }
  return null;
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
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    await ensureAppSchema();

    const { page, limit, offset } = parsePagination(url, { page: 1, limit: 100 }, 500);
    const format = (url.searchParams.get('format') || 'json').toLowerCase();
    const moduleFilter = (url.searchParams.get('module') || '').trim();
    const search = (url.searchParams.get('search') || '').trim();

    const params: any[] = [];
    let idx = 1;

    let where = 'WHERE 1=1';
    if (moduleFilter) {
      where += ` AND module_key = $${idx++}`;
      params.push(moduleFilter);
    }
    if (search) {
      where += ` AND (
        record_title ILIKE $${idx}
        OR COALESCE(location, '') ILIKE $${idx}
        OR COALESCE(creator_name, '') ILIKE $${idx}
        OR COALESCE(creator_email, '') ILIKE $${idx}
      )`;
      params.push(`%${search}%`);
      idx++;
    }

    const baseCte = `
      WITH first_creates AS (
        SELECT resource_type, resource_id, user_id
        FROM (
          SELECT
            al.resource_type,
            al.resource_id::text AS resource_id,
            al.user_id,
            ROW_NUMBER() OVER (
              PARTITION BY al.resource_type, al.resource_id
              ORDER BY al.created_at ASC
            ) AS rn
          FROM audit_logs al
          WHERE al.action LIKE '%.create'
        ) ranked
        WHERE rn = 1
      ),
      all_records AS (
        SELECT
          'mms'::text AS module_key,
          'MMS'::text AS module_label,
          m.id::text AS record_id,
          COALESCE(m.mms_numarasi, 'MMS #' || m.id::text) AS record_title,
          m.istasyon AS location,
          COALESCE(m.created_at, m.zaman_damgasi) AS created_at,
          COALESCE(u1.full_name, m.acan_ad_soyad, u2.full_name) AS creator_name,
          COALESCE(u1.email, u2.email) AS creator_email,
          jsonb_build_object(
            'mms_numarasi', m.mms_numarasi,
            'ariza_tanimi', m.ariza_tanimi,
            'istasyon', m.istasyon,
            'durum', m.durum,
            'bildiren', COALESCE(m.acan_ad_soyad, u1.full_name, u2.full_name)
          ) AS details
        FROM mms_records m
        LEFT JOIN users u1 ON u1.id = m.created_by
        LEFT JOIN first_creates fc ON fc.resource_type = 'mms_records' AND fc.resource_id = m.id::text
        LEFT JOIN users u2 ON u2.id = fc.user_id

        UNION ALL

        SELECT
          'calisma'::text AS module_key,
          'Çalışma İzni'::text AS module_label,
          c.id::text AS record_id,
          COALESCE(c.calisma_kodu, 'Çalışma #' || c.id::text) AS record_title,
          c.istasyon AS location,
          COALESCE(c.created_at, c.zaman_damgasi) AS created_at,
          u.full_name AS creator_name,
          u.email AS creator_email,
          jsonb_build_object(
            'mms_numarasi', c.mms_numarasi,
            'calisma_kodu', c.calisma_kodu,
            'yapilacak_is', c.yapilacak_is,
            'calisanlar', c.calisanlar,
            'istasyon', c.istasyon
          ) AS details
        FROM calisma_izinleri c
        LEFT JOIN first_creates fc ON fc.resource_type = 'calisma_izinleri' AND fc.resource_id = c.id::text
        LEFT JOIN users u ON u.id = fc.user_id

        UNION ALL

        SELECT
          'dahili'::text AS module_key,
          'Dahili Numara'::text AS module_label,
          d.id::text AS record_id,
          d.dahili_numara AS record_title,
          d.birim AS location,
          d.created_at AS created_at,
          u.full_name AS creator_name,
          u.email AS creator_email,
          jsonb_build_object(
            'dahili_numara', d.dahili_numara,
            'birim', d.birim,
            'aciklama', d.aciklama
          ) AS details
        FROM dahili_numaralar d
        LEFT JOIN first_creates fc ON fc.resource_type = 'dahili_numaralar' AND fc.resource_id = d.id::text
        LEFT JOIN users u ON u.id = fc.user_id

        UNION ALL

        SELECT
          'vardiya'::text AS module_key,
          'Vardiya'::text AS module_label,
          v.id::text AS record_id,
          TO_CHAR(v.ay, 'FM00') || '/' || v.yil::text AS record_title,
          v.istasyon AS location,
          v.created_at AS created_at,
          u.full_name AS creator_name,
          u.email AS creator_email,
          jsonb_build_object(
            'istasyon', v.istasyon,
            'yil', v.yil,
            'ay', v.ay,
            'personel_sayisi', jsonb_array_length(COALESCE(v.personel, '[]'::jsonb))
          ) AS details
        FROM vardiyalar v
        LEFT JOIN users u ON u.id = v.created_by
        WHERE v.is_active = true

        UNION ALL

        SELECT
          'kayip_esya'::text AS module_key,
          'Kayıp Eşya'::text AS module_label,
          k.id::text AS record_id,
          COALESCE(k.belge_no, 'Kayıp Eşya #' || k.id::text) AS record_title,
          COALESCE(k.teslim_alan, k.buroya_teslim_eden) AS location,
          COALESCE(k.created_at, k.tarih::timestamp) AS created_at,
          u.full_name AS creator_name,
          u.email AS creator_email,
          jsonb_build_object(
            'belge_no', k.belge_no,
            'esya_tanimi', k.esya_tanimi,
            'durumu', k.durumu,
            'teslim_alan', k.teslim_alan,
            'tarih', k.tarih
          ) AS details
        FROM kayip_esya k
        LEFT JOIN first_creates fc ON fc.resource_type = 'kayip_esya' AND fc.resource_id = k.id::text
        LEFT JOIN users u ON u.id = fc.user_id
      )
    `;

    const listQuery = `
      ${baseCte}
      SELECT module_key, module_label, record_id, record_title, location, created_at, creator_name, creator_email, details
      FROM all_records
      ${where}
      ORDER BY created_at DESC NULLS LAST
      LIMIT $${idx++} OFFSET $${idx}
    `;

    params.push(limit, offset);

    const countQuery = `
      ${baseCte}
      SELECT COUNT(*)::int AS count
      FROM all_records
      ${where}
    `;

    const [listResult, countResult] = await Promise.all([
      query<SystemRecordRow>(listQuery, params),
      query<{ count: number }>(countQuery, params.slice(0, params.length - 2)),
    ]);

    const normalizedRows = listResult.rows.map((row) => ({
      ...row,
      details: normalizeDetails(row.details),
    }));

    if (format === 'csv' || format === 'excel') {
      const exportLimit = Math.min(
        Number.parseInt(url.searchParams.get('export_limit') || '10000', 10) || 10000,
        50000
      );
      const filterParams = params.slice(0, params.length - 2);
      const exportParamIndex = filterParams.length + 1;
      const exportQuery = `
        ${baseCte}
        SELECT module_key, module_label, record_id, record_title, location, created_at, creator_name, creator_email, details
        FROM all_records
        ${where}
        ORDER BY created_at DESC NULLS LAST
        LIMIT $${exportParamIndex}
      `;
      const exportRowsResult = await query<SystemRecordRow>(
        exportQuery,
        [...filterParams, exportLimit]
      );
      const exportRows = exportRowsResult.rows.map((row) => ({
        ...row,
        details: normalizeDetails(row.details),
      }));

      if (format === 'csv') {
        const header = ['module_key', 'module_label', 'record_id', 'record_title', 'location', 'created_at', 'creator_name', 'creator_email', 'details'];
        const lines = [header.join(',')];
        for (const row of exportRows) {
          lines.push([
            csvCell(row.module_key),
            csvCell(row.module_label),
            csvCell(row.record_id),
            csvCell(row.record_title),
            csvCell(row.location),
            csvCell(row.created_at),
            csvCell(row.creator_name),
            csvCell(row.creator_email),
            csvCell(row.details ? JSON.stringify(row.details) : ''),
          ].join(','));
        }
        return new Response(lines.join('\n'), {
          status: 200,
          headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': `attachment; filename="system-records-${new Date().toISOString().slice(0, 10)}.csv"`,
            'Cache-Control': 'no-store',
          },
        });
      }

      const xmlRows = exportRows.map((row) => `
        <Row>
          <Cell><Data ss:Type="String">${xmlCell(row.module_key)}</Data></Cell>
          <Cell><Data ss:Type="String">${xmlCell(row.module_label)}</Data></Cell>
          <Cell><Data ss:Type="String">${xmlCell(row.record_id)}</Data></Cell>
          <Cell><Data ss:Type="String">${xmlCell(row.record_title)}</Data></Cell>
          <Cell><Data ss:Type="String">${xmlCell(row.location)}</Data></Cell>
          <Cell><Data ss:Type="String">${xmlCell(row.created_at)}</Data></Cell>
          <Cell><Data ss:Type="String">${xmlCell(row.creator_name)}</Data></Cell>
          <Cell><Data ss:Type="String">${xmlCell(row.creator_email)}</Data></Cell>
          <Cell><Data ss:Type="String">${xmlCell(row.details ? JSON.stringify(row.details) : '')}</Data></Cell>
        </Row>
      `).join('');

      const xml = `<?xml version="1.0"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Worksheet ss:Name="System Records">
    <Table>
      <Row>
        <Cell><Data ss:Type="String">module_key</Data></Cell>
        <Cell><Data ss:Type="String">module_label</Data></Cell>
        <Cell><Data ss:Type="String">record_id</Data></Cell>
        <Cell><Data ss:Type="String">record_title</Data></Cell>
        <Cell><Data ss:Type="String">location</Data></Cell>
        <Cell><Data ss:Type="String">created_at</Data></Cell>
        <Cell><Data ss:Type="String">creator_name</Data></Cell>
        <Cell><Data ss:Type="String">creator_email</Data></Cell>
        <Cell><Data ss:Type="String">details</Data></Cell>
      </Row>
      ${xmlRows}
    </Table>
  </Worksheet>
</Workbook>`;

      return new Response(xml, {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.ms-excel; charset=utf-8',
          'Content-Disposition': `attachment; filename="system-records-${new Date().toISOString().slice(0, 10)}.xls"`,
          'Cache-Control': 'no-store',
        },
      });
    }

    return new Response(
      JSON.stringify({
        records: normalizedRows,
        pagination: {
          page,
          limit,
          totalCount: countResult.rows[0]?.count || 0,
          totalPages: Math.ceil((countResult.rows[0]?.count || 0) / limit),
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('System records GET error:', error);
    return new Response(JSON.stringify({ error: 'Sistem kayıtları alınamadı' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
