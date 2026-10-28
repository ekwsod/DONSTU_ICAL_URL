import { findNextLesson } from "./schedule";
import { TYPE_LABELS, formatRoom, shiftDate, shortDate } from "./ui";
import type { DayWeather } from "./weather";
import type { DueMode, Homework, Lesson } from "./types";

/**
 * Модель Workers AI. DeepSeek V4 на бесплатном тарифе Workers недоступны (ошибка 5035),
 * а бесплатный DeepSeek R1 Distill думает 8–12 с и не собирает JSON для разбора дз.
 * Llama 3.3 70B бесплатна, отвечает за ~2 с и разбирает дз правильно.
 * На платном тарифе можно поставить "@cf/deepseek-ai/deepseek-v4.1-flash-1017".
 */
export const AI_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

/** Сколько ждём модель; дольше — работаем без ИИ. */
const AI_TIMEOUT_MS = 12_000;

export interface ChatMessage {
  role: "system" | "user";
  content: string;
}

/** Вызов модели: на входе сообщения и (опционально) JSON-схема ответа, на выходе текст или null. */
export type AiRunner = (messages: ChatMessage[], schema?: { name: string; schema: object }) => Promise<string | null>;

/** Обёртка над привязкой Workers AI. Любая ошибка или таймаут — null, бот работает дальше без ИИ. */
export function workersAiRunner(ai: Ai, model: string = AI_MODEL): AiRunner {
  return async (messages, schema) => {
    const request = {
      messages,
      max_tokens: 1500,
      temperature: 0.4,
      ...(schema ? { response_format: { type: "json_schema", json_schema: { ...schema, strict: true } } } : {}),
    };
    try {
      const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), AI_TIMEOUT_MS));
      // Модель новее, чем типы в @cf/workers-types, поэтому имя и запрос без строгой типизации.
      const run = (ai.run as (model: string, input: object) => Promise<unknown>)(model, request);
      const result = (await Promise.race([run, timeout])) as
        | { choices?: { message?: { content?: string | null } }[]; response?: string }
        | null;
      const text = result?.choices?.[0]?.message?.content ?? result?.response ?? null;
      return typeof text === "string" ? stripThinking(text) : null;
    } catch (err) {
      console.error("ai error", err);
      return null;
    }
  };
}

/** Рассуждающие модели пишут ход мысли в <think>…</think> — пользователю он не нужен. */
export function stripThinking(text: string): string | null {
  const clean = text.replace(/<think>[\s\S]*?<\/think>/g, "").replace(/^[\s\S]*<\/think>/, "").trim();
  return clean || null;
}

const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

// --- Комментарий к плану дня ---

const PLAN_SYSTEM_BASE = [
  "Ты — помощник студента в Telegram. Тебе дают план его учебного дня: пары, окна, погоду и что сдать.",
  "Напиши 1–2 коротких предложения по-русски, на «ты», по-дружески, можно с лёгкой шуткой.",
  "Формат пары (лекция, практика, лаба) — это просто вид занятия, а не задание и не долг.",
  "Не пересказывай расписание. Не называй время, номера пар и аудитории. Не выдумывай того, чего нет в данных.",
  "Без markdown, без списков, без эмодзи. Не длиннее 220 символов.",
];

const PLAN_SYSTEM_WITH_DUE = [
  ...PLAN_SYSTEM_BASE,
  "Дай практичный совет на сегодня: как одеться и нужен ли зонт, чем занять окно между парами.",
  "Можешь напомнить о том, что есть в разделе «Сдать сегодня», — и только об этом.",
].join("\n");

const PLAN_SYSTEM_NO_DUE = [
  ...PLAN_SYSTEM_BASE,
  "Дай практичный совет на сегодня: как одеться и нужен ли зонт, чем занять окно между парами.",
  "Сдавать сегодня нечего: не упоминай сдачу, дз, задания, отчёты и долги.",
].join("\n");

/** Страховка: дз нет, а модель всё равно про сдачу — такой совет не показываем. */
const DUE_TALK = /сда[тйюеёв]|сдач|(^|[^а-яё])дз([^а-яё]|$)|домашк|задани|отчёт|отчет|долг/i;

/** Факты для модели: только то, что бот и так показывает, в компактном виде. */
export function planFacts(lessons: Lesson[], weather: DayWeather | null, due: Homework[]): string {
  const sorted = [...lessons].sort((a, b) => a.start.localeCompare(b.start));
  const lines = ["Пары:"];
  sorted.forEach((l, i) => {
    const prev = sorted[i - 1];
    if (prev?.end) {
      const gap = minutes(l.start) - minutes(prev.end);
      if (gap > 45) lines.push(`- окно ${gap} мин`);
    }
    lines.push(`- ${l.start}–${l.end ?? "?"} ${l.title}, формат: ${TYPE_LABELS[l.type] || "занятие"}`);
  });
  if (weather) lines.push("Погода:", ...weather.top.map((w) => `- ${w}`), ...(weather.after ? [`- ${weather.after}`] : []));
  if (due.length > 0) {
    // Номер пары по порядку, а не время: модели запрещено называть время.
    const at = (h: Homework) => {
      const index = sorted.findIndex((l) => l.id === h.due_lesson_id);
      return index >= 0 ? ` (сдать на ${index + 1}-й паре дня)` : "";
    };
    lines.push("Сдать сегодня:", ...due.map((h) => `- ${h.title}: ${h.text}${at(h)}`));
  } else {
    // Явно: иначе модель додумывает задание по формату пары («лаба» → «сдай лабу»).
    lines.push("Сдать сегодня: ничего");
  }
  return lines.join("\n");
}

/** Убираем то, что модель могла добавить вопреки инструкции: кавычки, markdown, лишнюю длину. */
export function cleanComment(text: string): string | null {
  let clean = text
    .replace(/<think>[\s\S]*?<\/think>/g, "")
    .replace(/[*_`#]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^["«]|["»]$/g, "");
  if (!clean) return null;
  clean = clean[0].toUpperCase() + clean.slice(1);
  if (clean.length > 300) clean = `${clean.slice(0, 297).replace(/\s+\S*$/, "")}…`;
  return clean;
}

export async function planComment(
  run: AiRunner,
  lessons: Lesson[],
  weather: DayWeather | null,
  due: Homework[],
): Promise<string | null> {
  const answer = await run([
    { role: "system", content: due.length > 0 ? PLAN_SYSTEM_WITH_DUE : PLAN_SYSTEM_NO_DUE },
    { role: "user", content: planFacts(lessons, weather, due) },
  ]);
  const clean = answer ? cleanComment(answer) : null;
  if (clean && due.length === 0 && DUE_TALK.test(clean)) return null;
  return clean;
}

// --- Разбор дз из свободного текста ---

export interface Subject {
  key: string;
  title: string;
}

/** Предметы из расписания: уникальные по subject_key, по алфавиту. Порядок — основа для кнопок «qs:<номер>». */
export function subjectsFrom(lessons: Lesson[]): Subject[] {
  const map = new Map<string, string>();
  for (const l of lessons) if (l.subject_key && !map.has(l.subject_key)) map.set(l.subject_key, l.title);
  return [...map].map(([key, title]) => ({ key, title })).sort((a, b) => a.title.localeCompare(b.title, "ru"));
}

/** Черновик дз до подтверждения. */
export interface HomeworkDraft {
  subject_key: string | null;
  title: string | null;
  items: string[];
  due_date: string | null;
  due_lesson_id: string | null;
  /** Как выбран срок — для подписи в карточке. */
  due_label: string | null;
}

/** Что модель должна вернуть: номер предмета, вид срока, дата и пункты задания. */
export const HOMEWORK_SCHEMA = {
  name: "homework",
  schema: {
    type: "object",
    properties: {
      // Сначала — как предмет назван в тексте: так модель реже притягивает случайный предмет из списка.
      subject_mentioned: { type: "string", description: "Предмет так, как он назван в тексте; пустая строка, если не назван" },
      subject_index: { type: "integer", description: "Номер предмета из списка, -1 если его нет в списке" },
      due: { type: "string", enum: ["next", "lecture", "date", "none"] },
      date: { type: "string", description: "YYYY-MM-DD, если due = date, иначе пустая строка" },
      items: { type: "array", items: { type: "string" }, description: "Пункты задания" },
    },
    required: ["subject_mentioned", "subject_index", "due", "date", "items"],
    additionalProperties: false,
  },
};

const WEEKDAYS = ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"];

export function homeworkPrompt(text: string, today: string, subjects: Subject[], lessons: Lesson[]): ChatMessage[] {
  const weekday = (date: string) => WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()];
  const dates = Array.from({ length: 14 }, (_, i) => shiftDate(today, i + 1)).map((d) => `${d} — ${weekday(d)}`);
  const subjectLines = subjects.map((s, i) => {
    const next = lessons
      .filter((l) => l.subject_key === s.key && l.date >= today)
      .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start))
      .slice(0, 3)
      .map((l) => `${l.date} ${TYPE_LABELS[l.type] || "занятие"}`);
    return `${i}: ${s.title}${next.length ? ` (ближайшие: ${next.join(", ")})` : ""}`;
  });

  const system = [
    "Ты разбираешь домашнее задание студента, записанное как попало, и возвращаешь JSON.",
    `Сегодня ${today}, ${weekday(today)}. Ближайшие даты:`,
    ...dates,
    "",
    "Предметы (номер: название):",
    "-1: предмета нет в этом списке или он не назван",
    ...subjectLines,
    "",
    "Правила:",
    "- subject_mentioned — как предмет назван в тексте (например «матан», «история»), или пустая строка.",
    "- subject_index — номер предмета из списка, который означает subject_mentioned. Понимай сокращения и сленг (матан, матеша → математика; физра → физкультура; инфа → информатика; англ → английский).",
    "  Если subject_mentioned не означает ни один предмет из списка — строго -1. Похожий по теме предмет не подставляй.",
    "- due: «next» — если сказано «к следующей паре/семинару/практике»; «lecture» — «к лекции»; «date» — если назван день недели или дата (тогда date = YYYY-MM-DD из списка дат, «к пятнице» — ближайшая пятница после сегодня); «none» — срок не указан.",
    "- items — короткие пункты задания своими словами, без названия предмета и срока. Сохраняй номера задач, параграфов, страниц как есть.",
  ].join("\n");

  return [
    { role: "system", content: system },
    { role: "user", content: text },
  ];
}

interface HomeworkAnswer {
  subject_index: number;
  due: "next" | "lecture" | "date" | "none";
  date: string;
  items: string[];
}

/** Разбор ответа модели. Невалидный JSON — null; поля, которым нельзя верить, отбрасываются. */
export function parseHomeworkAnswer(raw: string, subjectsCount: number): HomeworkAnswer | null {
  const json = raw.match(/\{[\s\S]*\}/)?.[0];
  if (!json) return null;
  try {
    const data = JSON.parse(json) as Partial<HomeworkAnswer>;
    const index = Number.isInteger(data.subject_index) ? (data.subject_index as number) : -1;
    return {
      subject_index: index >= 0 && index < subjectsCount ? index : -1,
      due: ["next", "lecture", "date", "none"].includes(data.due as string) ? (data.due as HomeworkAnswer["due"]) : "none",
      date: typeof data.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(data.date) ? data.date : "",
      items: Array.isArray(data.items)
        ? data.items.filter((x): x is string => typeof x === "string" && x.trim() !== "").map((x) => x.trim())
        : [],
    };
  } catch {
    return null;
  }
}

/**
 * Срок черновика по предмету: явная дата (если в окне расписания), следующая пара или лекция.
 * Без указания срока — как в настройках (лекция или пара). Ничего не нашлось — срок пустой, спросим дату.
 */
export function resolveDue(
  lessons: Lesson[],
  now: { date: string; time: string },
  subjectKey: string,
  due: HomeworkAnswer["due"],
  date: string,
  mode: DueMode,
): Pick<HomeworkDraft, "due_date" | "due_lesson_id" | "due_label"> {
  const lastDate = lessons.reduce((max, l) => (l.date > max ? l.date : max), now.date);
  if (due === "date" && date > now.date && date <= lastDate) {
    const lesson = lessons
      .filter((l) => l.subject_key === subjectKey && l.date === date)
      .sort((a, b) => a.start.localeCompare(b.start))[0];
    return { due_date: date, due_lesson_id: lesson?.id ?? null, due_label: lesson ? "пара в этот день" : "к этой дате" };
  }

  const kind = due === "lecture" || (due !== "next" && mode === "lecture") ? "lecture" : "next";
  const lesson = findNextLesson(lessons, { date: now.date, start: now.time }, subjectKey, kind === "lecture" ? "lecture" : undefined);
  if (!lesson) return { due_date: null, due_lesson_id: null, due_label: null };
  return {
    due_date: lesson.date,
    due_lesson_id: lesson.id,
    due_label: kind === "lecture" ? "следующая лекция" : "следующая пара",
  };
}

/**
 * Явные слова в тексте надёжнее модели: «к лекции» — лекция, «к паре/семинару/практике» — следующая пара.
 * Дату (день недели) оставляем модели — её она определяет хорошо.
 */
export function dueKindFromText(text: string, modelDue: HomeworkAnswer["due"]): HomeworkAnswer["due"] {
  if (modelDue === "date") return modelDue;
  const lower = text.toLowerCase();
  if (/лекци/.test(lower)) return "lecture";
  if (/(след\w*|ближайш\w*)\s+(пар|семинар|практик|занят)/.test(lower)) return "next";
  return modelDue;
}

/**
 * Свободный текст → черновик дз. Если модель не ответила, предмет остаётся пустым,
 * а весь текст — одним пунктом: бот предложит выбрать предмет кнопками.
 */
export async function draftHomework(
  run: AiRunner,
  text: string,
  now: { date: string; time: string },
  lessons: Lesson[],
  mode: DueMode,
): Promise<HomeworkDraft> {
  const subjects = subjectsFrom(lessons);
  const raw = await run(homeworkPrompt(text, now.date, subjects, lessons), HOMEWORK_SCHEMA);
  const answer = raw ? parseHomeworkAnswer(raw, subjects.length) : null;

  const subject = answer && answer.subject_index >= 0 ? subjects[answer.subject_index] : null;
  const items = answer && answer.items.length > 0 ? answer.items : [text.trim()];
  const due = subject
    ? resolveDue(lessons, now, subject.key, dueKindFromText(text, answer?.due ?? "none"), answer?.date ?? "", mode)
    : { due_date: null, due_lesson_id: null, due_label: null };

  return { subject_key: subject?.key ?? null, title: subject?.title ?? null, items, ...due };
}

/** Карточка подтверждения черновика (HTML). */
export function draftText(draft: HomeworkDraft, lessons: Lesson[], escape: (s: string) => string): string {
  const lines = ["✍️ <b>Записать так?</b>", ""];
  lines.push(`📝 <b>${draft.title ? escape(draft.title) : "Предмет не понял — выбери ниже"}</b>`);
  for (const item of draft.items) lines.push(`• ${escape(item)}`);
  lines.push("");
  if (draft.due_date) {
    const lesson = lessons.find((l) => l.id === draft.due_lesson_id);
    const when = lesson
      ? `${shortDate(draft.due_date)}, ${lesson.start}${lesson.room ? `, ${escape(formatRoom(lesson.room))}` : ""}`
      : shortDate(draft.due_date);
    lines.push(`📅 Срок: <b>${when}</b>${draft.due_label ? ` <i>(${draft.due_label})</i>` : ""}`);
  } else {
    lines.push("📅 Срок: <i>не нашёл пару — выбери дату</i>");
  }
  return lines.join("\n");
}

/** Готовое дз из подтверждённого черновика. */
export function draftToHomework(id: string, draft: HomeworkDraft): Homework | null {
  if (!draft.subject_key || !draft.title || !draft.due_date) return null;
  return {
    id,
    text: draft.items.join("; "),
    title: draft.title,
    subject_key: draft.subject_key,
    from_lesson_id: "",
    due_date: draft.due_date,
    due_lesson_id: draft.due_lesson_id,
    done: false,
  };
}
