import { PAIR_NUMBERS, TYPE_ICONS, TYPE_LABELS, escapeHtml, formatRoom } from "./ui";
import { dayWeather, type Forecast } from "./weather";
import type { Homework, Lesson } from "./types";

/** Текущие дата и время по Москве (UTC+3, без перехода на зимнее время). */
export function moscowNow(nowMs = Date.now()): { date: string; time: string } {
  const iso = new Date(nowMs + 3 * 60 * 60 * 1000).toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
}

const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

/**
 * Первая пара, перед которой пора прислать погоду, или null.
 * Окно — от (начало пары − leadMinutes) до начала пары: cron срабатывает раз в несколько минут
 * и может пропустить точный момент. lastSent не даёт отправить второй раз за день.
 */
export function lessonToWarnAbout(
  now: { date: string; time: string },
  lessons: Lesson[],
  leadMinutes: number,
  lastSent: string | null,
): Lesson | null {
  if (leadMinutes <= 0 || lastSent === now.date) return null;
  const first = lessons
    .filter((l) => l.date === now.date)
    .sort((a, b) => a.start.localeCompare(b.start))[0];
  if (!first) return null;

  const current = minutes(now.time);
  const start = minutes(first.start);
  return current >= start - leadMinutes && current < start ? first : null;
}

/** Окно напоминания о дз: с выбранного часа и ещё два часа, на случай пропущенных тиков cron. */
const REMIND_WINDOW_MINUTES = 120;

/**
 * Дз, о которых пора напомнить: открытые, со сроком на завтра, если сейчас окно напоминания
 * и сегодня ещё не напоминали. Позже окна не шлём: утром всё равно придёт «сегодня сдавать».
 */
export function homeworkToRemind(
  now: { date: string; time: string },
  homework: Homework[],
  remindHour: number,
  lastSent: string | null,
): Homework[] {
  if (remindHour <= 0 || lastSent === now.date) return [];
  const current = minutes(now.time);
  if (current < remindHour * 60 || current >= remindHour * 60 + REMIND_WINDOW_MINUTES) return [];

  const tomorrow = new Date(`${now.date}T00:00:00Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const date = tomorrow.toISOString().slice(0, 10);
  return homework.filter((h) => !h.done && h.due_date === date);
}

export function reminderText(due: Homework[], lessons: Lesson[]): string {
  const lines = [`🔔 <b>Завтра сдавать</b> (${due.length}):`];
  for (const h of due) {
    const lesson = lessons.find((l) => l.id === h.due_lesson_id);
    const when = lesson ? ` — к ${lesson.start}` : "";
    lines.push(`📝 ${escapeHtml(h.title)}${when}: ${escapeHtml(h.text)}`);
  }
  return lines.join("\n");
}

/** Перерыв длиннее этого — «окно» (обычная перемена 10 мин, обед 40 мин). */
const WINDOW_MINUTES = 45;

function duration(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} мин`;
  return m === 0 ? `${h} ч` : `${h} ч ${m} мин`;
}

/**
 * Сообщение перед выходом — план на день: погода, затем все пары по порядку
 * (номер, время, предмет, куда идти, что сдать), окна между парами и когда всё закончится.
 */
export function morningText(first: Lesson, todayLessons: Lesson[], forecast: Forecast | null, homework: Homework[]): string {
  const lessons = [...todayLessons].sort((a, b) => a.start.localeCompare(b.start));
  const due = homework.filter((h) => !h.done && h.due_date === first.date);
  const last = lessons[lessons.length - 1] ?? first;
  const finish = last.end ?? last.start;

  const lines = [`⏰ <b>Скоро выходить</b> — первая пара в <b>${first.start}</b>`, ""];

  const weather = forecast && dayWeather(forecast, first.date, lessons);
  lines.push(...(weather ? weather.top.map(escapeHtml) : ["Погоду сейчас не получить 🤷"]), "");

  lines.push(`<b>План на сегодня</b> (${lessons.length} ${lessons.length === 1 ? "пара" : lessons.length < 5 ? "пары" : "пар"}, до ${finish}):`);
  lessons.forEach((lesson, i) => {
    const prev = lessons[i - 1];
    if (prev?.end) {
      const gap = minutes(lesson.start) - minutes(prev.end);
      if (gap > WINDOW_MINUTES) lines.push(`☕ окно ${prev.end}–${lesson.start} (${duration(gap)})`);
    }
    const number = PAIR_NUMBERS[lesson.start];
    const time = lesson.end ? `${lesson.start}–${lesson.end}` : lesson.start;
    const type = TYPE_LABELS[lesson.type] ? ` (${TYPE_LABELS[lesson.type]})` : "";
    lines.push(
      `<b>${number ? `${number} пара · ` : ""}${time}</b> — ${TYPE_ICONS[lesson.type]} ${escapeHtml(lesson.title)}${type}`,
    );
    if (lesson.room) lines.push(`📍 ${escapeHtml(formatRoom(lesson.room))}`);
    for (const h of due.filter((h) => h.due_lesson_id === lesson.id)) {
      lines.push(`📝 сдать: ${escapeHtml(h.text)}`);
    }
  });
  lines.push(`🏁 Пары закончатся в ${finish}`);
  if (weather?.after) lines.push(escapeHtml(weather.after));

  const loose = due.filter((h) => !lessons.some((l) => l.id === h.due_lesson_id));
  if (loose.length > 0) {
    lines.push("", "<b>Ещё сдать сегодня:</b>", ...loose.map((h) => `📝 ${escapeHtml(h.title)}: ${escapeHtml(h.text)}`));
  }
  return lines.join("\n");
}
