import { describe, expect, it } from 'vitest';
import { verifyInitData, miniApi } from '../src/miniapp';
import type { Env } from '../src/types';

async function signed(owner = '42', auth = 1800000000) {
  const params = new URLSearchParams({ auth_date: String(auth), user: JSON.stringify({ id: Number(owner) }), query_id: 'example' });
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode('WebAppData'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const secret = await crypto.subtle.sign('HMAC', key, enc.encode('test-token'));
  const signingKey = await crypto.subtle.importKey('raw', secret, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const data = [...params].sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => `${k}=${v}`).join('\n');
  const hash = await crypto.subtle.sign('HMAC', signingKey, enc.encode(data));
  params.set('hash', [...new Uint8Array(hash)].map(x => x.toString(16).padStart(2, '0')).join(''));
  return params.toString();
}

describe('Mini App access', () => {
  it('accepts the owner with a fresh Telegram signature', async () => {
    expect(await verifyInitData(await signed(), 'test-token', '42', 1800000010000)).toBe(true);
  });
  it('rejects tampering, other users, expired sessions and future timestamps', async () => {
    const raw = await signed();
    expect(await verifyInitData(raw.replace('example', 'tampered'), 'test-token', '42', 1800000010000)).toBe(false);
    expect(await verifyInitData(await signed('43'), 'test-token', '42', 1800000010000)).toBe(false);
    expect(await verifyInitData(raw, 'test-token', '42', 1800007200000)).toBe(false);
    expect(await verifyInitData(raw, 'test-token', '42', 1799999900000)).toBe(false);
  });
  it('never reads private data without authentication', async () => {
    const response = await miniApi(new Request('https://example.test/api/app'), { BOT_TOKEN: 'test-token', OWNER_CHAT_ID: '42' } as Env);
    expect(response.status).toBe(401);
  });
});
