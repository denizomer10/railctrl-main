import { db, sql } from 'astro:db';

export interface DBQueryResult<T = any> {
  rows: T[];
  rowCount: number;
}

export interface DBTransactionClient {
  query<T = any>(text: string, params?: any[]): Promise<DBQueryResult<T>>;
}

function normalizeResult<T = any>(result: any): DBQueryResult<T> {
  if (!result) {
    return { rows: [], rowCount: 0 };
  }

  if (Array.isArray(result)) {
    const count = typeof result.count === 'number' ? result.count : result.length;
    return { rows: result as T[], rowCount: count };
  }

  if ('rows' in result) {
    return {
      rows: (result.rows || []) as T[],
      rowCount:
        typeof result.rowCount === 'number'
          ? result.rowCount
          : (typeof result.rowsAffected === 'number' ? result.rowsAffected : 0),
    };
  }

  if ('rowsAffected' in result && typeof result.rowsAffected === 'number') {
    return { rows: [], rowCount: result.rowsAffected };
  }

  return { rows: [], rowCount: 0 };
}

function quoteSqlValue(value: any): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
  if (typeof value === 'boolean') return value ? '1' : '0';
  if (value instanceof Date) return `'${value.toISOString().replace('T', ' ').replace('Z', '')}'`;
  if (Array.isArray(value)) {
    return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
  }
  if (typeof value === 'object') {
    return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
  }
  return `'${String(value).replace(/'/g, "''")}'`;
}

function buildExecutableSql(text: string, params: any[] = []): string {
  let out = text;

  out = out.replace(/\bILIKE\b/g, 'LIKE');
  out = out.replace(/\bNOW\(\)/g, 'CURRENT_TIMESTAMP');
  out = out.replace(/::\s*[a-zA-Z_][a-zA-Z0-9_]*(\([^)]*\))?(\[\])?/g, '');
  out = out.replace(/\bUUID\b/g, 'TEXT');
  out = out.replace(/\bJSONB\b/g, 'TEXT');
  out = out.replace(/\bINET\b/g, 'TEXT');
  out = out.replace(/\bBIGSERIAL\b/g, 'INTEGER');
  out = out.replace(/\bSERIAL\b/g, 'INTEGER');
  out = out.replace(/BOOLEAN\s+NOT\s+NULL\s+DEFAULT\s+true/gi, 'INTEGER NOT NULL DEFAULT 1');
  out = out.replace(/BOOLEAN\s+NOT\s+NULL\s+DEFAULT\s+false/gi, 'INTEGER NOT NULL DEFAULT 0');
  out = out.replace(/BOOLEAN\s+DEFAULT\s+true/gi, 'INTEGER DEFAULT 1');
  out = out.replace(/BOOLEAN\s+DEFAULT\s+false/gi, 'INTEGER DEFAULT 0');
  out = out.replace(/TO_CHAR\(([^,]+),\s*'FM00'\)/gi, "printf('%02d', $1)");
  out = out.replace(/jsonb_array_length\(/gi, 'json_array_length(');
  out = out.replace(/jsonb_build_object\(/gi, 'json_object(');
  out = out.replace(/TRUNCATE TABLE\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+RESTART IDENTITY/gi, 'DELETE FROM $1');
  out = out.replace(/=\s*true\b/gi, '= 1');
  out = out.replace(/=\s*false\b/gi, '= 0');
  out = out.replace(/\bNULLS\s+LAST\b/gi, '');

  // PostgreSQL aggregate FILTER to SQLite-compatible CASE WHEN
  out = out.replace(
    /COUNT\(\*\)\s+FILTER\s*\(\s*WHERE\s+([^)]+)\)/gi,
    'SUM(CASE WHEN $1 THEN 1 ELSE 0 END)'
  );

  if (params.length === 0) return out;

  // Two-phase replacement to avoid replacing $n fragments inside parameter values.
  for (let i = params.length; i >= 1; i -= 1) {
    const token = new RegExp(`\\$${i}(?!\\d)`, 'g');
    out = out.replace(token, `__PARAM_${i}__`);
  }
  for (let i = params.length; i >= 1; i -= 1) {
    const placeholder = new RegExp(`__PARAM_${i}__`, 'g');
    out = out.replace(placeholder, quoteSqlValue(params[i - 1]));
  }
  return out;
}

async function runAstroDb(text: string, params?: any[]): Promise<any> {
  const executable = buildExecutableSql(text, params || []);
  try {
    return await db.run(sql.raw(executable));
  } catch (error) {
    console.error('SQL exec failed:', executable);
    throw error;
  }
}

export async function getPool(): Promise<typeof db> {
  return db;
}

export async function query<T = any>(
  text: string,
  params?: any[]
): Promise<DBQueryResult<T>> {
  const start = Date.now();

  try {
    const result = normalizeResult<T>(await runAstroDb(text, params));

    const duration = Date.now() - start;
    if (duration > 100) {
      console.warn(`Slow query (${duration}ms):`, text.substring(0, 120));
    }

    return result;
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
}

export async function transaction<T>(callback: (client: DBTransactionClient) => Promise<T>): Promise<T> {
  try {
    await runAstroDb('BEGIN');
    const client: DBTransactionClient = {
      query: async <R = any>(text: string, params?: any[]) =>
        normalizeResult<R>(await runAstroDb(text, params)),
    };
    const result = await callback(client);
    await runAstroDb('COMMIT');
    return result;
  } catch (error) {
    await runAstroDb('ROLLBACK');
    throw error;
  }
}

export async function checkConnection(): Promise<boolean> {
  try {
    const result = await query('SELECT 1 as ok');
    return result.rows.length > 0;
  } catch (error) {
    console.error('Database health check failed:', error);
    return false;
  }
}

export async function closePool(): Promise<void> {
  // Astro DB manages connections internally.
}

export const Tables = {
  USERS: 'users',
  SESSIONS: 'sessions',
  REFRESH_TOKENS: 'refresh_tokens',
  FILE_CATEGORIES: 'file_categories',
  FILES: 'files',
  AUDIT_LOGS: 'audit_logs',
} as const;

export type TableName = (typeof Tables)[keyof typeof Tables];

export default {
  getPool,
  query,
  transaction,
  checkConnection,
  closePool,
  Tables,
};
