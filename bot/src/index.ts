import { Api, Bot, InlineKeyboard, webhookCallback, type Context } from "grammy";
import {
  draftHomework,
  draftText,
  draftToHomework,
  resolveDue,
  subjectsFrom,
  workersAiRunner,
  type HomeworkDraft,
} from "./ai";
import { autoDue, dueOptions, makeHomework, openHomework } from "./homework";
import { homeworkToRemind, lessonToWarnAbout, morningText, moscowNow, nextStudyDate, reminderText } from "./morning";
import { Store } from "./store";
import {
  MAX_WEEK_OFFSET,
  LEGACY_MENU,
  MENU,
  NEW_HOMEWORK_TEXT,
  REMIND_HOURS,
  SETTINGS_TEXT,
  WEATHER_LEADS,
  dayKeyboard,
  dayText,
  dottedDate,
  draftKeyboard,
  escapeHtml,
  dueKeyboard,
  homeworkCardKeyboard,
  homeworkCardText,
  homeworkKeyboard,
  homeworkText,
  longDate,
  mainMenu,
  settingsKeyboard,
  shiftDate,
  shortDate,
  subjectsKeyboard,
  todaySummary,
  weekDates,
  weekKeyboard,
  weekTitle,
  weeksKeyboard,
} from "./ui";
import { dayWeather, fetchForecast, weatherBadge, type Forecast } from "./weather";
import type { DueMode, Env, Homework, Lesson, LessonsPayload, Settings } from "./types";

const todayMoscow = () => moscowNow().date;

/** Прогноз из KV-кеша, при промахе — из Open-Meteo. null, если погода недоступна. */
async function getForecast(store: Store, env: Env): Promise<Forecast | null> {
  const cached = await store.getWeather();
  if (cached) return cached;
  const fresh = await fetchForecast(env.WEATHER_LAT, env.WEATHER_LON);
  if (fresh) await store.putWeather(fresh);
  return fresh;
}

function countBy<T>(items: T[], key: (item: T) => string): Map<string, number> {
  const map = new Map<string, number>();
  for (const item of items) map.set(key(item), (map.get(key(item)) ?? 0) + 1);
  return map;
}

const NO_SCHEDULE = "Расписание ещё не загружено. Подожди ночного обновления.";

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

  /** Отправить новое сообщение или отредактировать текущее (для нажатий inline-кнопок). Текст — HTML. */
  const show = async (ctx: Context, text: string, reply_markup: InlineKeyboard) => {
    const options = { reply_markup, parse_mode: "HTML" as const };
    if (ctx.callbackQuery) await ctx.editMessageText(text, options);
    else await ctx.reply(text, options);
  };

  const showWeek = async (ctx: Context, offset: number, mode: "view" | "due" = "view") => {
    const payload = await store.getLessons();
    if (!payload) {
      await ctx.reply(NO_SCHEDULE);
      return;
    }
    const today = todayMoscow();
    const [homework, forecast] = await Promise.all([store.getHomework().then(openHomework), getForecast(store, env)]);
    const weather = new Map<string, string>();
    for (const date of weekDates(today, offset)) {
      const badge = forecast && weatherBadge(forecast, date);
      if (badge) weather.set(date, badge);
    }
    const keyboard = weekKeyboard(
      today,
      offset,
      {
        lessons: countBy(payload.lessons, (l) => l.date),
        homework: countBy(homework, (h) => h.due_date),
        weather,
      },
      mode,
    );
    const title = mode === "due" ? `Выбери дату сдачи. ${weekTitle(today, offset)}` : weekTitle(today, offset);
    await show(ctx, title, keyboard);
  };

  /** Экран дня: погода, пары со временем, дз. Главный экран бота. */
  const showDay = async (ctx: Context, date: string) => {
    const [all, homework, forecast] = await Promise.all([lessonsList(), store.getHomework(), getForecast(store, env)]);
    if (all.length === 0 && !(await store.getLessons())) {
      await ctx.reply(NO_SCHEDULE);
      return;
    }
    const lessons = all.filter((l) => l.date === date);
    const weather = forecast && dayWeather(forecast, date, lessons);
    await show(ctx, dayText(date, lessons, homework, weather), dayKeyboard(todayMoscow(), date, lessons, homework));
  };

  const showWeeks = async (ctx: Context) => {
    await show(ctx, "Какая неделя?", weeksKeyboard(todayMoscow()));
  };

  const showHomeworkList = async (ctx: Context) => {
    const list = openHomework(await store.getHomework());
    await show(ctx, homeworkText(list), homeworkKeyboard(list, true));
  };

  const showSettings = async (ctx: Context) => {
    const settings = await store.getSettings();
    await ctx.reply(SETTINGS_TEXT, { reply_markup: settingsKeyboard(settings), parse_mode: "HTML" });
  };

  /** Сохраняет дз из pending и сообщает, на какую дату поставлено. */
  const saveHomework = async (ctx: Context, from: Lesson, text: string, due: { date: string; lesson: Lesson | null }) => {
    const list = await store.getHomework();
    const homework = makeHomework(crypto.randomUUID().slice(0, 8), text, from, due);
    list.push(homework);
    await store.putHomework(list);
    await store.clearPending();
    const when = due.lesson ? `${shortDate(due.date)}, ${due.lesson.start}` : dottedDate(due.date);
    await ctx.reply(`Записал дз по «${from.title}» на ${when}.`, { reply_markup: homeworkCardKeyboard(homework) });
  };

  // --- Меню и команды ---

  bot.command("start", async (ctx) => {
    await store.clearPending();
    await ctx.api
      .setMyCommands([
        { command: "today", description: "Сегодня: пары и погода" },
        { command: "week", description: "Выбрать неделю" },
        { command: "hw", description: "Мои дз" },
        { command: "new", description: "Записать дз своими словами" },
        { command: "plan", description: "Пример плана перед выходом" },
        { command: "settings", description: "Настройки: срок дз, погода, напоминания" },
        { command: "cancel", description: "Отменить ввод дз" },
      ])
      .catch(() => {});
    // Меню-клавиатура должна быть прикреплена к сообщению — прикрепляем к сводке на сегодня.
    const today = todayMoscow();
    const [lessons, forecast] = await Promise.all([lessonsList(), getForecast(store, env)]);
    const summary = todaySummary(
      today,
      lessons.filter((l) => l.date === today),
      forecast && weatherBadge(forecast, today),
    );
    await ctx.reply(summary, { reply_markup: mainMenu() });
    await showDay(ctx, today);
  });

  // Нажатие кнопки меню прерывает незаконченный ввод дз.
  const menu = (handler: (ctx: Context) => Promise<void>) => async (ctx: Context) => {
    await store.clearPending();
    await handler(ctx);
  };

  bot.command("today", menu((ctx) => showDay(ctx, todayMoscow())));
  bot.hears(MENU.today, menu((ctx) => showDay(ctx, todayMoscow())));
  bot.hears(MENU.tomorrow, menu((ctx) => showDay(ctx, shiftDate(todayMoscow(), 1))));
  bot.command("week", menu(showWeeks));
  bot.hears(MENU.weeks, menu(showWeeks));
  // Старые кнопки меню у кого-то ещё на экране — присылаем новое меню и сегодняшний день.
  bot.hears(LEGACY_MENU, menu(async (ctx) => {
    await ctx.reply("Меню обновилось 👇", { reply_markup: mainMenu() });
    await showDay(ctx, todayMoscow());
  }));
  bot.command("hw", menu(showHomeworkList));
  bot.command("new", menu((ctx) => askNewHomework(ctx)));
  bot.hears(MENU.homework, menu(showHomeworkList));

  // «Записать дз»: подсказка, следующий текст уйдёт в разбор ИИ (pending очищен — текст не примут за «➕ дз» у пары).
  const askNewHomework = async (ctx: Context) => {
    await ctx.reply(NEW_HOMEWORK_TEXT, { parse_mode: "HTML" });
  };
  bot.hears(MENU.newHomework, menu(askNewHomework));
  bot.callbackQuery("qn", async (ctx) => {
    await store.clearPending();
    await ctx.answerCallbackQuery();
    await askNewHomework(ctx);
  });
  bot.command("settings", menu(showSettings));

  // Пример плана перед выходом — на ближайший день с парами. Утреннюю отправку не трогает.
  const previewPlan = async (ctx: Context) => {
    const lessons = await lessonsList();
    const date = nextStudyDate(lessons, todayMoscow());
    if (!date) {
      await ctx.reply("В расписании пока нет пар — показать нечего.");
      return;
    }
    await ctx.replyWithChatAction("typing").catch(() => {});
    const plan = await buildPlan(env, store, lessons, date);
    const note = `<i>Пример: так придёт перед выходом (${longDate(date)})</i>`;
    if (plan) await ctx.reply(`${note}\n\n${plan}`, { parse_mode: "HTML" });
  };
  bot.command("plan", menu(previewPlan));
  bot.callbackQuery("pv", async (ctx) => {
    await ctx.answerCallbackQuery();
    await previewPlan(ctx);
  });
  bot.hears(MENU.settings, menu(showSettings));

  bot.command("cancel", async (ctx) => {
    await store.clearPending();
    await ctx.reply("Ок, отменил.", { reply_markup: mainMenu() });
  });

  // --- Неделя и день ---

  bot.callbackQuery(/^w:(\d)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await showWeek(ctx, Math.min(Number(ctx.match[1]), MAX_WEEK_OFFSET));
  });

  bot.callbackQuery("wk", async (ctx) => {
    await ctx.answerCallbackQuery();
    await showWeeks(ctx);
  });

  bot.callbackQuery(/^d:(\d{4}-\d{2}-\d{2})$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await showDay(ctx, ctx.match[1]);
  });

  // Подписи-иконки в настройках: нажатие ничего не делает.
  bot.callbackQuery("noop", (ctx) => ctx.answerCallbackQuery());

  // --- Добавление дз ---

  // «➕ дз» у пары: ждём текст.
  bot.callbackQuery(/^a:(\w+)$/, async (ctx) => {
    const lesson = (await lessonsList()).find((l) => l.id === ctx.match[1]);
    if (!lesson) {
      await ctx.answerCallbackQuery({ text: "Пара не найдена, открой неделю заново" });
      return;
    }
    await store.putPending({ lesson_id: lesson.id });
    await ctx.answerCallbackQuery();
    await ctx.reply(`Напиши дз по «${lesson.title}». Отмена — /cancel`);
  });

  /** Карточка черновика «Записать так?» — новым сообщением или правкой текущего. */
  const showDraft = async (ctx: Context, draft: HomeworkDraft) => {
    await show(ctx, draftText(draft, await lessonsList(), escapeHtml), draftKeyboard(draft));
  };

  /** Свободный текст → ИИ разбирает предмет, срок и пункты → карточка на подтверждение. */
  const quickHomework = async (ctx: Context, text: string) => {
    const lessons = await lessonsList();
    if (lessons.length === 0) {
      await ctx.reply(NO_SCHEDULE);
      return;
    }
    await ctx.replyWithChatAction("typing").catch(() => {});
    const settings = await store.getSettings();
    const draft = await draftHomework(workersAiRunner(env.AI), text, moscowNow(), lessons, settings.due_mode);
    await store.putPending({ draft });
    await showDraft(ctx, draft);
  };

  // Текст: ответ на «➕ дз» у пары или дз свободным текстом.
  bot.on("message:text", async (ctx) => {
    if (ctx.message.text.startsWith("/")) return;
    const pending = await store.getPending();
    if (!pending?.lesson_id || pending.text !== undefined) {
      await quickHomework(ctx, ctx.message.text);
      return;
    }

    const lessons = await lessonsList();
    const from = lessons.find((l) => l.id === pending.lesson_id);
    if (!from) {
      await store.clearPending();
      await ctx.reply("Пара пропала из расписания, начни заново.");
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

  // --- Черновик дз от ИИ ---

  /** Черновик из pending; если его нет — диалог устарел. */
  const pendingDraft = async (ctx: Context) => {
    const draft = (await store.getPending())?.draft;
    if (!draft) {
      await ctx.editMessageText("Черновик устарел — напиши дз заново.");
      return null;
    }
    return draft;
  };

  bot.callbackQuery("q:ok", async (ctx) => {
    await ctx.answerCallbackQuery();
    const draft = await pendingDraft(ctx);
    if (!draft) return;
    const homework = draftToHomework(crypto.randomUUID().slice(0, 8), draft);
    if (!homework) {
      await showDraft(ctx, draft);
      return;
    }
    const list = await store.getHomework();
    list.push(homework);
    await store.putHomework(list);
    await store.clearPending();
    await showHomeworkCard(ctx, homework);
  });

  bot.callbackQuery("q:subj", async (ctx) => {
    await ctx.answerCallbackQuery();
    if (!(await pendingDraft(ctx))) return;
    await show(ctx, "К какому предмету?", subjectsKeyboard(subjectsFrom(await lessonsList())));
  });

  bot.callbackQuery("q:back", async (ctx) => {
    await ctx.answerCallbackQuery();
    const draft = await pendingDraft(ctx);
    if (draft) await showDraft(ctx, draft);
  });

  // Предмет выбран вручную: срок пересчитываем по нему.
  bot.callbackQuery(/^qs:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const draft = await pendingDraft(ctx);
    if (!draft) return;
    const lessons = await lessonsList();
    const subject = subjectsFrom(lessons)[Number(ctx.match[1])];
    if (!subject) return showDraft(ctx, draft);
    const settings = await store.getSettings();
    const next: HomeworkDraft = {
      ...draft,
      subject_key: subject.key,
      title: subject.title,
      ...resolveDue(lessons, moscowNow(), subject.key, "none", "", settings.due_mode),
    };
    await store.putPending({ draft: next });
    await showDraft(ctx, next);
  });

  /** Достаёт pending с текстом и исходную пару; если их нет — гасит диалог. */
  const pendingWithLesson = async (ctx: Context) => {
    const pending = await store.getPending();
    const lessons = await lessonsList();
    const from = lessons.find((l) => l.id === pending?.lesson_id);
    if (!pending?.text || !from) {
      await store.clearPending();
      await ctx.editMessageText("Ок, не записываю.");
      return null;
    }
    return { text: pending.text, from, lessons };
  };

  // Срок из меню: следующая пара / лекция / отмена.
  bot.callbackQuery(/^due:(next|lecture|cancel)$/, async (ctx) => {
    const choice = ctx.match[1];
    await ctx.answerCallbackQuery();
    if (choice === "cancel") {
      await store.clearPending();
      await ctx.editMessageText("Ок, не записываю.");
      return;
    }
    const state = await pendingWithLesson(ctx);
    if (!state) return;

    const option = dueOptions(state.lessons, state.from).find((o) => o.kind === choice);
    if (!option) {
      await showWeek(ctx, 0, "due");
      return;
    }
    await ctx.deleteMessage().catch(() => {});
    await saveHomework(ctx, state.from, state.text, { date: option.lesson.date, lesson: option.lesson });
  });

  // «Другая дата»: неделя в режиме выбора срока.
  bot.callbackQuery(/^dw:(\d)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const hasDraft = Boolean((await store.getPending())?.draft);
    if (!hasDraft && !(await pendingWithLesson(ctx))) return;
    await showWeek(ctx, Math.min(Number(ctx.match[1]), MAX_WEEK_OFFSET), "due");
  });

  bot.callbackQuery(/^dd:(\d{4}-\d{2}-\d{2})$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const date = ctx.match[1];
    const draft = (await store.getPending())?.draft;
    if (draft) {
      // Для черновика дата — к паре этого предмета в тот день, если она есть; затем снова карточка.
      const lesson = (await lessonsList())
        .filter((l) => l.subject_key === draft.subject_key && l.date === date)
        .sort((a, b) => a.start.localeCompare(b.start))[0];
      const next: HomeworkDraft = {
        ...draft,
        due_date: date,
        due_lesson_id: lesson?.id ?? null,
        due_label: lesson ? "пара в этот день" : "к этой дате",
      };
      await store.putPending({ draft: next });
      await showDraft(ctx, next);
      return;
    }
    const state = await pendingWithLesson(ctx);
    if (!state) return;
    await ctx.deleteMessage().catch(() => {});
    await saveHomework(ctx, state.from, state.text, { date: ctx.match[1], lesson: null });
  });

  // --- Просмотр дз ---

  const showHomeworkCard = async (ctx: Context, homework: Homework) => {
    const dueLesson = (await lessonsList()).find((l) => l.id === homework.due_lesson_id) ?? null;
    await show(ctx, homeworkCardText(homework, dueLesson), homeworkCardKeyboard(homework));
  };

  bot.callbackQuery(/^h:(\w+)$/, async (ctx) => {
    const homework = (await store.getHomework()).find((h) => h.id === ctx.match[1]);
    if (!homework) {
      await ctx.answerCallbackQuery({ text: "Это дз уже удалено" });
      return;
    }
    await ctx.answerCallbackQuery();
    await showHomeworkCard(ctx, homework);
  });

  bot.callbackQuery("hl", async (ctx) => {
    await ctx.answerCallbackQuery();
    await showHomeworkList(ctx);
  });

  // Дз: сделано / удалить, затем обратно к списку.
  bot.callbackQuery(/^(done|del):(\w+)$/, async (ctx) => {
    const [, action, id] = ctx.match;
    const list = await store.getHomework();
    const next =
      action === "done" ? list.map((h) => (h.id === id ? { ...h, done: true } : h)) : list.filter((h) => h.id !== id);
    await store.putHomework(next);
    await ctx.answerCallbackQuery({ text: action === "done" ? "Сделано ✔" : "Удалено" });
    await showHomeworkList(ctx);
  });

  const updateSettings = async (ctx: Context, patch: Partial<Settings>) => {
    const settings = { ...(await store.getSettings()), ...patch };
    await store.putSettings(settings);
    await ctx.answerCallbackQuery({ text: "Сохранил" });
    await ctx.editMessageReplyMarkup({ reply_markup: settingsKeyboard(settings) });
  };

  bot.callbackQuery(/^set:(ask|next|lecture)$/, (ctx) => updateSettings(ctx, { due_mode: ctx.match[1] as DueMode }));

  bot.callbackQuery(/^wl:(\d+)$/, async (ctx) => {
    const lead = Number(ctx.match[1]);
    if (!WEATHER_LEADS.includes(lead)) return ctx.answerCallbackQuery();
    await updateSettings(ctx, { weather_lead: lead });
  });

  bot.callbackQuery(/^hr:(\d+)$/, async (ctx) => {
    const hour = Number(ctx.match[1]);
    if (!REMIND_HOURS.includes(hour)) return ctx.answerCallbackQuery();
    await updateSettings(ctx, { hw_remind_hour: hour });
  });

  return bot;
}

/** План дня перед выходом (тот же, что шлёт cron): погода, пары, окна и дз. null — в этот день пар нет. */
async function buildPlan(env: Env, store: Store, lessons: Lesson[], date: string): Promise<string | null> {
  const day = lessons.filter((l) => l.date === date).sort((a, b) => a.start.localeCompare(b.start));
  if (day.length === 0) return null;
  const [forecast, homework] = await Promise.all([getForecast(store, env), store.getHomework()]);
  return morningText(day[0], day, forecast, homework);
}

async function sendMorningWeather(env: Env): Promise<void> {
  const store = new Store(env.SCHEDULE);
  const [payload, settings, lastSent] = await Promise.all([
    store.getLessons(),
    store.getSettings(),
    store.getWeatherSent(),
  ]);
  const now = moscowNow();
  const lessons = payload?.lessons ?? [];
  const first = lessonToWarnAbout(now, lessons, settings.weather_lead, lastSent);
  if (!first) return;

  // Отмечаем заранее: при сбое отправки лучше пропустить утро, чем слать дубли каждые 5 минут.
  await store.putWeatherSent(now.date);
  const text = await buildPlan(env, store, lessons, first.date);
  if (text) await new Api(env.BOT_TOKEN).sendMessage(env.OWNER_CHAT_ID, text, { parse_mode: "HTML" });
}

/** Cron: накануне срока, в выбранный час, напоминаем о дз на завтра (раз в день). */
async function sendHomeworkReminder(env: Env): Promise<void> {
  const store = new Store(env.SCHEDULE);
  const [homework, settings, lastSent] = await Promise.all([
    store.getHomework(),
    store.getSettings(),
    store.getHomeworkReminded(),
  ]);
  const now = moscowNow();
  const due = homeworkToRemind(now, homework, settings.hw_remind_hour, lastSent);
  if (due.length === 0) return;

  await store.putHomeworkReminded(now.date);
  const lessons = (await store.getLessons())?.lessons ?? [];
  await new Api(env.BOT_TOKEN).sendMessage(env.OWNER_CHAT_ID, reminderText(due, lessons), {
    parse_mode: "HTML",
    reply_markup: homeworkKeyboard(due),
  });
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

  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(Promise.all([sendMorningWeather(env), sendHomeworkReminder(env)]));
  },
};
