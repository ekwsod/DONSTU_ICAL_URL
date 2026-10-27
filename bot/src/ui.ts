import { InlineKeyboard } from "grammy";
import { dayWindow } from "./schedule";
import type { DueOption } from "./homework";
import type { DueMode, Homework, Lesson, LessonType } from "./types";

const WEEKDAYS = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
const WEEKDAYS_FULL = ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"];
const MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];

const TYPE_LABELS: Record<LessonType, string> = {
  lecture: "лекция",
  practice: "практика",
  lab: "лаба",
  other: "",
};

const MODE_LABELS: Record<DueMode, string> = {
  ask: "Спрашивать каждый раз",
  next: "Всегда к следующей паре",
  lecture: "Всегда к следующей лекции",
};

const parse = (date: string) => new Date(`${date}T00:00:00Z`);

/** «Пн 2» — для кнопок. */
export function shortDate(date: string): string {
  const d = parse(date);
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()}`;
}

/** «2 ноября, понедельник» — для заголовков. */
export function longDate(date: string): string {
  const d = parse(date);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}, ${WEEKDAYS_FULL[d.getUTCDay()]}`;
}

/** «02.11» — для сроков в списках. */
export function dottedDate(date: string): string {
  return `${date.slice(8, 10)}.${date.slice(5, 7)}`;
}

export function shiftDate(date: string, days: number): string {
  const d = parse(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Inline-клавиатура на 14 дней: две строки по семь.
 * Сегодня — «•», день без пар — «·», день со сроком дз — «📌».
 * `prefix` задаёт действие: «d» открыть день, «dd» выбрать дату срока.
 */
export function buildWeekKeyboard(
  today: string,
  lessonDates: Set<string>,
  homeworkDates: Set<string> = new Set(),
  prefix = "d",
): InlineKeyboard {
  const kb = new InlineKeyboard();
  const days = dayWindow(today, 14);

  days.forEach((date, i) => {
    let mark = date === today ? "•" : lessonDates.has(date) ? "" : "·";
    if (homeworkDates.has(date)) mark = "📌";
    kb.text(`${mark}${shortDate(date)}`, `${prefix}:${date}`);
    if (i % 7 === 6) kb.row();
  });

  return kb;
}

function lessonLine(lesson: Lesson): string {
  const time = lesson.end ? `${lesson.start}–${lesson.end}` : lesson.start;
  const type = TYPE_LABELS[lesson.type];
  const extra = [type, lesson.room ? `ауд. ${lesson.room}` : ""].filter(Boolean).join(", ");
  return `${time} ${lesson.title}${extra ? ` (${extra})` : ""}`;
}

/** Текст дня: пары по порядку и дз, срок которых приходится на эту пару или день. */
export function dayText(date: string, lessons: Lesson[], homework: Homework[]): string {
  const lines = [longDate(date), ""];
  const due = homework.filter((h) => !h.done && h.due_date === date);

  if (lessons.length === 0) {
    lines.push("Пар нет 🎉");
  }
  for (const lesson of lessons) {
    lines.push(lessonLine(lesson));
    for (const h of due.filter((h) => h.due_lesson_id === lesson.id)) {
      lines.push(`   📝 ${h.text}`);
    }
  }

  const loose = due.filter((h) => !lessons.some((l) => l.id === h.due_lesson_id));
  if (loose.length > 0) {
    lines.push("", "Дз на этот день:");
    for (const h of loose) lines.push(`📝 ${h.title}: ${h.text}`);
  }

  return lines.join("\n");
}

export function dayKeyboard(date: string, lessons: Lesson[]): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const lesson of lessons) {
    kb.text(`➕ дз · ${lesson.start} ${lesson.title}`, `a:${lesson.id}`).row();
  }
  kb.text("◀", `d:${shiftDate(date, -1)}`)
    .text("К неделям", "w")
    .text("▶", `d:${shiftDate(date, 1)}`);
  return kb;
}

/** Меню срока: варианты по предмету плюс «Другая дата». */
export function dueKeyboard(options: DueOption[]): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const o of options) {
    const label = o.kind === "next" ? "К следующей паре" : "К следующей лекции";
    kb.text(`${label} (${shortDate(o.lesson.date)}, ${o.lesson.start})`, `due:${o.kind}`).row();
  }
  kb.text("Другая дата", "due:other").row();
  kb.text("Отмена", "due:cancel");
  return kb;
}

export function homeworkText(list: Homework[]): string {
  if (list.length === 0) return "Открытых дз нет 🙌";
  return [
    "Открытые дз:",
    ...list.map((h, i) => `${i + 1}. до ${dottedDate(h.due_date)} — ${h.title}: ${h.text}`),
  ].join("\n");
}

export function homeworkKeyboard(list: Homework[]): InlineKeyboard {
  const kb = new InlineKeyboard();
  list.forEach((h, i) => {
    kb.text(`✔ ${i + 1}`, `done:${h.id}`).text(`🗑 ${i + 1}`, `del:${h.id}`).row();
  });
  return kb;
}

export function settingsKeyboard(current: DueMode): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const mode of Object.keys(MODE_LABELS) as DueMode[]) {
    kb.text(`${mode === current ? "✅ " : ""}${MODE_LABELS[mode]}`, `set:${mode}`).row();
  }
  return kb;
}
