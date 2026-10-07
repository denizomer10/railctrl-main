/**
 * Küçük veritabanı inceleme yardımcısı. Astro DB ile aynı dosyayı (@libsql/client)
 * üzerinden açar. Kullanım:
 *   node tools/db.mjs "SELECT name FROM sqlite_master WHERE type='table'"
 */
import { createClient } from '@libsql/client';
import path from 'node:path';

const dbFile = process.env.ASTRO_DATABASE_FILE || '.astro/content.db';
const client = createClient({ url: `file:${path.resolve(dbFile)}` });

const sql = process.argv.slice(2).join(' ') || "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name";

try {
  const res = await client.execute(sql);
  const rows = res.rows.map((r) => Object.fromEntries(Object.entries(r)));
  console.log(JSON.stringify(rows, null, 2));
} catch (error) {
  console.error('DB error:', error.message);
  process.exitCode = 1;
}
