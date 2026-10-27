import { Bot, webhookCallback, type Context } from "grammy";
import { autoDue, dueOptions, makeHomework, openHomework } from "./homework";
import { lessonsByDate } from "./schedule";
import { Store } from "./store";
import {
  buildWeekKeyboard,
  dayKeyboard,
  dayText,
  dottedDate,
  dueKeyboard,
  homeworkKeyboard,
  homeworkText,
  settingsKeyboard,
  shortDate,
} from "./ui";
import type { DueMode, Env, Lesson, LessonsPayload } from "./types";

/** Сегодняшняя дата по Москве (UTC+3, без перехода на зимнее время). */
function todayMoscow(): string {
  return new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function createBot(env: Env, store: Store): Bot {
  const bot = new Bot(env.BOT_TOKEN);

  // Ошибка в хендлере (например, «message is not modified» при двойном тапе) не должна
  // превращаться в 500: иначе Telegram будет повторять тот же update.
  // bot.catch() работает только при polling, поэтому ловим сами.
  bot.use(async (_ctx, next) => {
    try {
      await next();
    } catch (err) {
      console.error("bot error", err);
    }
  });

  // Бот отвечает только владельцу.
  bot.use(async (ctx, next) => {
    if (String(ctx.chat?.id) !== env.OWNER_CHAT_ID) return;
    await next();
  });

  const lessonsList = async (): Promise<Lesson[]> => (await store.getLessons())?.lessons ?? [];

  const weekView = async () => {
    const payload = await store.getLessons();
    if (!payload) return null;
    const homework = openHomework(await store.getHomework());
    return {
      text: "Расписание на 14 дней:",
      keyboard: buildWeekKeyboard(
        todayMoscow(),
        new Set(lessonsByDate(payload).keys()),
        new Set(homework.map((h) => h.due_date)),
      ),
    };
  };

  const sendWeek = async (ctx: Context) => {
    const view = await weekView();
    if (!view) {
      await ctx.reply("Расписание ещё не загружено. Подожди ночного обновления.");
      return;
    }
    await ctx.reply(view.text, { reply_markup: view.keyboard });
  };

  const sendHomework = async (ctx: Context, edit = false) => {
    const list = openHomework(await store.getHomework());
    const text = homeworkText(list);
    const reply_markup = homeworkKeyboard(list);
    if (edit) await ctx.editMessageText(text, { reply_markup });
    else await ctx.reply(text, { reply_markup });
  };

  /** Сохраняет дз из pending и сообщает, на какую дату поставлено. */
  const saveHomework = async (ctx: Context, from: Lesson, text: string, due: { date: string; lesson: Lesson | null }) => {
    const list = await store.getHomework();
    list.push(makeHomework(crypto.randomUUID().slice(0, 8), text, from, due));
    await store.putHomework(list);
    await store.clearPending();
    const when = due.lesson ? `${shortDate(due.date)}, ${due.lesson.start}` : dottedDate(due.date);
    await ctx.reply(`Записал дз по «${from.title}» на ${when}.`);
  };

  bot.command(["start", "week"], sendWeek);
  bot.command("hw", (ctx) => sendHomework(ctx));

  bot.command("settings", async (ctx) => {
    const settings = await store.getSettings();
    await ctx.reply("Срок дз по умолчанию:", { reply_markup: settingsKeyboard(settings.due_mode) });
  });

  bot.command("cancel", async (ctx) => {
    await store.clearPending();
    await ctx.reply("Ок, отменил.");
  });

  // Открыть день.
  bot.callbackQuery(/^d:(\d{4}-\d{2}-\d{2})$/, async (ctx) => {
    const date = ctx.match[1];
    const lessons = (await lessonsList()).filter((l) => l.date === date);
    const homework = await store.getHomework();
    await ctx.editMessageText(dayText(date, lessons, homework), { reply_markup: dayKeyboard(date, lessons) });
    await ctx.answerCallbackQuery();
  });

  // Назад к сетке.
  bot.callbackQuery("w", async (ctx) => {
    const view = await weekView();
    if (view) await ctx.editMessageText(view.text, { reply_markup: view.keyboard });
    await ctx.answerCallbackQuery();
  });

  // «➕ дз» у пары: ждём текст.
  bot.callbackQuery(/^a:(\w+)$/, async (ctx) => {
    const lesson = (await lessonsList()).find((l) => l.id === ctx.match[1]);
    if (!lesson) {
      await ctx.answerCallbackQuery({ text: "Пара не найдена, обнови расписание /week" });
      return;
    }
    await store.putPending({ lesson_id: lesson.id });
    await ctx.answerCallbackQuery();
    await ctx.reply(`Напиши дз по «${lesson.title}». Отмена — /cancel`);
  });

  // Текст дз.
  bot.on("message:text", async (ctx) => {
    if (ctx.message.text.startsWith("/")) return;
    const pending = await store.getPending();
    if (!pending || pending.text !== undefined) return;

    const lessons = await lessonsList();
    const from = lessons.find((l) => l.id === pending.lesson_id);
    if (!from) {
      await store.clearPending();
      await ctx.reply("Пара пропала из расписания, начни заново через /week.");
      return;
    }

    const text = ctx.message.text.trim();
    const settings = await store.getSettings();
    const auto = autoDue(lessons, from, settings.due_mode);
    if (auto) {
      await saveHomework(ctx, from, text, { date: auto.date, lesson: auto });
      return;
    }

    await store.putPending({ lesson_id: from.id, text });
    const hint = settings.due_mode !== "ask" ? "Подходящей пары в расписании нет. " : "";
    await ctx.reply(`${hint}К какому сроку?`, { reply_markup: dueKeyboard(dueOptions(lessons, from)) });
  });

  // Выбор срока из меню.
  bot.callbackQuery(/^due:(next|lecture|other|cancel)$/, async (ctx) => {
    const choice = ctx.match[1];
    const pending = await store.getPending();
    await ctx.answerCallbackQuery();

    if (choice === "cancel" || !pending?.text) {
      await store.clearPending();
      await ctx.editMessageText("Ок, не записываю.");
      return;
    }

    const lessons = await lessonsList();
    const from = lessons.find((l) => l.id === pending.lesson_id);
    if (!from) {
      await store.clearPending();
      await ctx.editMessageText("Пара пропала из расписания, начни заново через /week.");
      return;
    }

    if (choice === "other") {
      await ctx.editMessageText("Выбери дату:", {
        reply_markup: buildWeekKeyboard(todayMoscow(), new Set(lessonsByDate({ lessons }).keys()), new Set(), "dd"),
      });
      return;
    }

    const option = dueOptions(lessons, from).find((o) => o.kind === choice);
    if (!option) {
      await ctx.editMessageText("Такой пары уже нет, выбери дату:", {
        reply_markup: buildWeekKeyboard(todayMoscow(), new Set(lessonsByDate({ lessons }).keys()), new Set(), "dd"),
      });
      return;
    }
    await ctx.deleteMessage().catch(() => {});
    await saveHomework(ctx, from, pending.text, { date: option.lesson.date, lesson: option.lesson });
  });

  // Срок — произвольная дата.
  bot.callbackQuery(/^dd:(\d{4}-\d{2}-\d{2})$/, async (ctx) => {
    const date = ctx.match[1];
    const pending = await store.getPending();
    await ctx.answerCallbackQuery();
    const from = (await lessonsList()).find((l) => l.id === pending?.lesson_id);
    if (!pending?.text || !from) {
      await store.clearPending();
      await ctx.editMessageText("Ок, не записываю.");
      return;
    }
    await ctx.deleteMessage().catch(() => {});
    await saveHomework(ctx, from, pending.text, { date, lesson: null });
  });

  // Дз: готово / удалить.
  bot.callbackQuery(/^(done|del):(\w+)$/, async (ctx) => {
    const [, action, id] = ctx.match;
    const list = await store.getHomework();
    const next =
      action === "done" ? list.map((h) => (h.id === id ? { ...h, done: true } : h)) : list.filter((h) => h.id !== id);
    await store.putHomework(next);
    await ctx.answerCallbackQuery({ text: action === "done" ? "Готово ✔" : "Удалено" });
    await sendHomework(ctx, true);
  });

  bot.callbackQuery(/^set:(ask|next|lecture)$/, async (ctx) => {
    const due_mode = ctx.match[1] as DueMode;
    await store.putSettings({ due_mode });
    await ctx.answerCallbackQuery({ text: "Сохранил" });
    await ctx.editMessageReplyMarkup({ reply_markup: settingsKeyboard(due_mode) });
  });

  return bot;
}

async function handlePush(request: Request, env: Env): Promise<Response> {
  const auth = request.headers.get("Authorization");
  if (auth !== `Bearer ${env.PUSH_TOKEN}`) {
    return new Response("unauthorized", { status: 401 });
  }
  const payload = (await request.json()) as LessonsPayload;
  if (!Array.isArray(payload.lessons)) {
    return new Response("bad payload", { status: 400 });
  }
  await new Store(env.SCHEDULE).putLessons(payload);
  return new Response(`ok: ${payload.lessons.length}`);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/push") {
      return handlePush(request, env);
    }

    if (request.method === "POST" && url.pathname === "/webhook") {
      const bot = createBot(env, new Store(env.SCHEDULE));
      const handle = webhookCallback(bot, "cloudflare-mod", { secretToken: env.WEBHOOK_SECRET });
      return handle(request);
    }

    return new Response("not found", { status: 404 });
  },
};
