import type { Env } from './types';
const key = (token: string) => 'web-session:' + token;
export async function issueWebCode(env: Env): Promise<string> {
  const code = crypto.randomUUID().replaceAll('-', '');
  await env.SCHEDULE.put('web-code:' + code, '1', { expirationTtl: 300 });
  return code;
}
export async function webSession(request: Request, env: Env): Promise<boolean> {
  const token = request.headers.get('Cookie')?.match(/(?:^|; )web_session=([a-f0-9]{64})(?:;|$)/)?.[1];
  return !!token && await env.SCHEDULE.get(key(token)) === '1';
}
export async function webLogin(request: Request, env: Env): Promise<Response> {
  const origin = new URL(request.url).origin;
  if (request.headers.get('Origin') !== origin) return new Response('Forbidden', { status: 403 });
  try {
    const { code } = await request.json() as { code: string };
    if (!/^[a-f0-9]{32}$/.test(code) || await env.SCHEDULE.get('web-code:' + code) !== '1') return Response.json({ error: 'Код неверный или истёк. Получи новый через /web.' }, { status: 401 });
    await env.SCHEDULE.delete('web-code:' + code);
    const token = crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '');
    await env.SCHEDULE.put(key(token), '1', { expirationTtl: 2592000 });
    return Response.json({ ok: true }, { headers: { 'Set-Cookie': `web_session=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=2592000`, 'Cache-Control': 'no-store' } });
  } catch { return new Response('Bad request', { status: 400 }); }
}
