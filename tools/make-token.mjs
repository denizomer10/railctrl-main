/**
 * Yerel oturum anahtarıyla geçerli bir access/refresh token üretir.
 * Kullanım:
 *   node tools/make-token.mjs <userId> [access|refresh]
 */
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const userId = process.argv[2] || 'admin-id';
const type = process.argv[3] === 'refresh' ? 'refresh' : 'access';

const keyPath = process.env.RAILCTRL_SESSION_KEY_FILE
  ? path.resolve(process.env.RAILCTRL_SESSION_KEY_FILE)
  : path.resolve(process.cwd(), '.astro', 'session.key');

const key = readFileSync(keyPath);
if (key.length !== 32) throw new Error('session.key 32 bayt olmalı');

const TOKEN_PREFIX = 'rc1';
const lifetimeSec = type === 'refresh' ? 30 * 24 * 60 * 60 : 86400;

const encodedPayload = Buffer.from(JSON.stringify({ userId, type })).toString('base64url');
const nonce = crypto.randomBytes(32).toString('hex');
const expiresAt = Math.floor(Date.now() / 1000) + lifetimeSec;
const signedValue = `${TOKEN_PREFIX}.${encodedPayload}.${nonce}.${expiresAt}`;
const signature = crypto.createHmac('sha256', key).update(signedValue).digest('hex');
console.log(`${signedValue}.${signature}`);
