import { escapeHtml } from "./ui";
import { weatherLines, type Forecast } from "./weather";
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

/** Сообщение «скоро выходить»: первая пара, погода на день и дз со сроком на сегодня. */
export function morningText(first: Lesson, todayLessons: Lesson[], forecast: Forecast | null, homework: Homework[]): string {
  const where = first.room ? `, ауд. ${escapeHtml(first.room)}` : "";
  const lines = [`⏰ <b>Скоро выходить</b>`, `Первая пара в <b>${first.start}</b>: ${escapeHtml(first.title)}${where}`];

  const weather = forecast ? weatherLines(forecast, first.date, todayLessons) : [];
  lines.push("", ...(weather.length > 0 ? weather.map(escapeHtml) : ["Погоду сейчас не получить 🤷"]));

  const due = homework.filter((h) => !h.done && h.due_date === first.date);
  if (due.length > 0) {
    lines.push("", "<b>Сегодня сдавать:</b>", ...due.map((h) => `📝 ${escapeHtml(h.title)}: ${escapeHtml(h.text)}`));
  }
  return lines.join("\n");
}
