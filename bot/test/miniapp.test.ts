import { describe, expect, it, vi } from 'vitest';
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

describe('native homework entry', () => {
  const lesson = { id: 'lesson', date: '2026-11-20', start: '10:15', end: '11:50', title: 'Математика', subject_key: 'математика', type: 'lecture', room: '1-111' };
  function setup() {
    const token = 'a'.repeat(64);
    const values = new Map<string, string>([['web-session:' + token, '1'], ['lessons', JSON.stringify({ lessons: [lesson] })]]);
    const put = vi.fn(async (k: string, v: string) => { values.set(k, v); });
    const env = { BOT_TOKEN: 'token', OWNER_CHAT_ID: '42', SCHEDULE: { get: async (k: string) => values.get(k) ?? null, put }, AI: { run: vi.fn(async () => ({ response: JSON.stringify({subject_index: 0, due: 'date', date: '2026-11-20', items: ['задачи 1–5']}) })) } } as unknown as Env;
    const request = (body: unknown) => new Request('https://example.test/api/app', { method: 'POST', headers: { Origin: 'https://example.test', Cookie: 'web_session=' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { env, request, put };
  }
  it('AI parsing returns an editable draft without saving homework', async () => {
    const { env, request, put } = setup();
    const response = await miniApi(request({ action: 'draft', text: 'математика задачи 1–5' }), env);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ draft: { title: 'Математика', items: ['задачи 1–5'] } });
    expect(put).not.toHaveBeenCalled();
  });
  it('manual date can differ from the selected lesson and is validated', async () => {
    const { env, request } = setup();
    expect((await miniApi(request({ action: 'add', lesson_id: 'lesson', text: 'отчёт', due_date: '2026-02-30' }), env)).status).toBe(400);
    const response = await miniApi(request({ action: 'add', lesson_id: 'lesson', text: 'отчёт', due_date: '2026-11-21' }), env);
    expect(await response.json()).toMatchObject({ homework: [{ due_date: '2026-11-21', due_lesson_id: null }] });
  });
});
