import type { Env } from './types';
import { Store } from './store';
import { webSession } from './webauth';
import { draftHomework, workersAiRunner } from './ai';
import { moscowNow } from './morning';

/** Проверка initData: доверяем только подписи Telegram, никогда initDataUnsafe. */
export async function verifyInitData(raw: string, token: string, owner: string, now = Date.now()): Promise<boolean> {
  try {
    const params = new URLSearchParams(raw);
    if (new Set(params.keys()).size !== [...params.keys()].length) return false;
    const hash = params.get('hash') ?? '';
    const auth = Number(params.get('auth_date'));
    if (!/^[a-f0-9]{64}$/.test(hash) || !Number.isFinite(auth) || auth * 1000 > now + 30000 || now - auth * 1000 > 3600000) return false;
    if (String(JSON.parse(params.get('user') ?? '{}').id) !== owner) return false;
    params.delete('hash');
    const data = [...params].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => `${k}=${v}`).join('\n');
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', enc.encode('WebAppData'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const secret = await crypto.subtle.sign('HMAC', key, enc.encode(token));
    const signingKey = await crypto.subtle.importKey('raw', secret, { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    const signature = Uint8Array.from(hash.match(/../g)!, x => parseInt(x, 16));
    return await crypto.subtle.verify('HMAC', signingKey, signature, enc.encode(data));
  } catch { return false; }
}

export async function miniApi(request: Request, env: Env): Promise<Response> {
  const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
  if (request.method !== 'GET' && request.headers.get('Origin') !== new URL(request.url).origin) return json({ error: 'Недопустимый источник запроса' }, 403);
  if (!await verifyInitData(request.headers.get('X-Telegram-Init-Data') ?? '', env.BOT_TOKEN, env.OWNER_CHAT_ID) && !await webSession(request, env)) return json({ error: 'Для входа получи код командой /web в боте.' }, 401);
  const store = new Store(env.SCHEDULE);
  if (request.method === 'GET') {
    const [schedule, homework] = await Promise.all([store.getLessons(), store.getHomework()]);
    return json({ lessons: schedule?.lessons ?? [], homework, generated_at: schedule?.generated_at ?? null });
  }
  if (request.method !== 'POST') return json({ error: 'Метод не поддерживается' }, 405);
  try {
    const body = await request.json() as Record<string, unknown>;
    if (body.action === 'draft' && typeof body.text === 'string' && body.text.trim().length > 0 && body.text.length <= 2000) {
      const lessons = (await store.getLessons())?.lessons ?? [];
      if (!lessons.length) return json({ error: 'Расписание ещё не загружено' }, 400);
      const draft = await draftHomework(workersAiRunner(env.AI), body.text, moscowNow(), lessons, (await store.getSettings()).due_mode);
      return json({ draft });
    }
    const list = await store.getHomework();
    if (body.action === 'toggle' && typeof body.id === 'string' && typeof body.done === 'boolean') {
      const item = list.find(h => h.id === body.id);
      if (!item) return json({ error: 'Задание не найдено' }, 404);
      item.done = body.done;
    } else if (body.action === 'add' && typeof body.lesson_id === 'string' && typeof body.text === 'string' && body.text.trim().length > 0 && body.text.length <= 2000) {
      const lesson = (await store.getLessons())?.lessons.find(l => l.id === body.lesson_id);
      if (!lesson) return json({ error: 'Пара не найдена. Обнови расписание.' }, 400);
      const due = body.due_date === undefined ? lesson.date : body.due_date;
      if (typeof due !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(due) || !Number.isFinite(Date.parse(due)) || new Date(due).toISOString().slice(0,10) !== due) return json({ error: 'Некорректная дата срока' }, 400);
      list.push({ id: crypto.randomUUID(), text: body.text.trim(), title: lesson.title, subject_key: lesson.subject_key, from_lesson_id: '', due_date: due, due_lesson_id: due === lesson.date ? lesson.id : null, done: false });
    } else return json({ error: 'Проверь поля задания' }, 400);
    await store.putHomework(list);
    return json({ homework: list });
  } catch { return json({ error: 'Не удалось сохранить. Попробуй ещё раз.' }, 400); }
}
