import config from "../../config.json";
import type { LessonType, LessonsPayload } from "./types";

/**
 * Будильник на iPhone и список пар для бота — прямо в Worker, по iCal ДГТУ.
 * Перенос schedule_alarm.py один в один: те же фильтры подгруппы и РКИ, та же очистка названий,
 * те же id пар (иначе дз потеряют привязку к паре). Настройки — общий config.json в корне репозитория.
 * Зачем: cron Worker срабатывает вовремя, а ночные запуски GitHub Actions опаздывают на 2–3 часа,
 * и в 04:00 iPhone видел вчерашний файл. Считать заранее вечером нельзя — расписание меняется ночью.
 */

export interface AlarmConfig {
  subgroup: number;
  prep_minutes: number;
  latest_alarm: string;
  slots: string[];
  exclude_keywords: string[];
  lessons_horizon_days: number;
}

const toMinutes = (time: string) => Number(time.split(":")[0]) * 60 + Number(time.split(":")[1]);

export const ALARM_CONFIG: AlarmConfig = {
  subgroup: config.subgroup,
  prep_minutes: config.prep_minutes,
  latest_alarm: config.latest_alarm,
  slots: [...config.slots].sort((a, b) => toMinutes(a) - toMinutes(b)),
  exclude_keywords: config.exclude_keywords,
  lessons_horizon_days: config.lessons_horizon_days,
};

/** Москва без перехода на зимнее время — как в moscowNow. */
const MOSCOW_OFFSET = "+03:00";

export interface IcalEvent {
  uid: string;
  summary: string;
  location: string;
  /** Время начала по Москве: YYYY-MM-DDTHH:MM:SS. */
  start: string;
  end: string | null;
}

// В Python \w и \b понимают кириллицу, в JS — нет: «буква» задаём через \p{L} с флагом u.
const W = "[\\p{L}\\p{N}_]";
const B = `(?:(?<=${W})(?!${W})|(?<!${W})(?=${W}))`;
const re = (source: string, flags = "") => new RegExp(source.replaceAll("\\b", B), `u${flags}`);

const pad = (n: number) => String(n).padStart(2, "0");

/** «20261017T053000Z» (UTC) или «20261017T083000» (уже по Москве) → «2026-10-17T08:30:00» по Москве. */
export function parseIcalDate(value: string): string | null {
  const m = value.trim().match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, z] = m;
  if (!z) return `${y}-${mo}-${d}T${h}:${mi}:${s}`;
  const t = new Date(Date.UTC(+y, +mo - 1, +d, +h + 3, +mi, +s));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}T${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}:${pad(t.getUTCSeconds())}`;
}

export function unescapeIcal(value: string): string {
  return value.replace(/\\([\\;,nN])/g, (_, c: string) => (c === "n" || c === "N" ? "\n" : c));
}

export function parseIcal(content: string): IcalEvent[] {
  const clean = content.replace(/^[﻿ \t\r\n]+/, "");
  if (!clean.includes("BEGIN:VCALENDAR")) throw new Error("not an iCalendar");
  const unfolded = clean.replace(/\r?\n[ \t]/g, "");

  const events: IcalEvent[] = [];
  for (const [, block] of unfolded.matchAll(/BEGIN:VEVENT\r?\n([\s\S]*?)\r?\nEND:VEVENT/g)) {
    const fields: Record<string, string> = {};
    for (const raw of block.split(/\r\n|\r|\n/)) {
      const line = raw.trim();
      const colon = line.indexOf(":");
      if (!line || colon < 0) continue;
      fields[line.slice(0, colon).split(";")[0].trim().toUpperCase()] = line.slice(colon + 1);
    }
    const start = fields.DTSTART !== undefined ? parseIcalDate(fields.DTSTART) : null;
    if (!start) continue;
    events.push({
      uid: fields.UID ?? "",
      summary: unescapeIcal(fields.SUMMARY ?? ""),
      location: unescapeIcal(fields.LOCATION ?? ""),
      start,
      end: fields.DTEND !== undefined ? parseIcalDate(fields.DTEND) : null,
    });
  }
  return events;
}

export function extractSubgroup(summary: string): number | null {
  const m = summary.match(re("(?:п/?г|подгрупп[аы]|пг)\\.?\\s*(\\d+)", "i")) ?? summary.match(re("(\\d+)\\s*(?:п/?г|подгрупп[аы])", "i"));
  return m ? Number(m[1]) : null;
}

export function isUserEvent(event: IcalEvent, cfg: AlarmConfig = ALARM_CONFIG): boolean {
  const summary = event.summary.trim();
  const lower = summary.toLowerCase();
  for (const raw of cfg.exclude_keywords) {
    const kw = raw.trim().toLowerCase();
    if (!kw) continue;
    if (lower.includes(kw)) return false;
    // Основа слова — чтобы ловить падежи.
    const stem = kw.replace(/[аяоеиыейью]$/u, "");
    if (stem.length >= 4 && lower.includes(stem)) return false;
  }
  if (re("русск\\w*.*иностранн\\w*|иностранн\\w*.*русск\\w*|\\bрки\\b".replaceAll("\\w", W)).test(lower)) return false;
  const sg = extractSubgroup(summary);
  return sg === null || sg === cfg.subgroup;
}

/** Название без подгрупп, ФИО преподавателей и шифров групп. */
export function sanitizeTitle(summary: string): string | null {
  if (!summary) return null;
  let text = summary.trim();
  text = text.replace(re("[\\(\\[\\{]?(?:п/?г|подгрупп[аы]|пг)\\.?\\s*\\d+[\\)\\]\\}]?", "gi"), "");
  text = text.replace(re("[\\(\\[\\{]?\\d+\\s*(?:п/?г|подгрупп[аы])[\\)\\]\\}]?", "gi"), "");
  text = text.replace(re("\\b[А-ЯЁ][а-яё]+\\s+[А-ЯЁ]\\.\\s*[А-ЯЁ]?\\.?", "g"), "");
  text = text.replace(re("\\b(?:гр\\.?(?=\\s|\\d|$)|групп[аы](?=\\s|\\d|$))\\s*", "gi"), "");
  text = text.replace(re("\\b[А-Яа-яA-Za-z]{2,5}-?\\d{2,4}\\b", "g"), "");
  text = text.replace(/^[,\-–—:\s]+|[,\-–—:\s]+$/gu, "");
  text = text.replace(/\s{2,}/gu, " ").trim();
  return text || null;
}

export function sanitizeRoom(location: string): string | null {
  return location.trim() || null;
}

export function classifyLesson(summary: string): LessonType {
  const lower = summary.toLowerCase();
  if (re("\\bлек(?:ция|\\.|\\s|$)").test(lower)) return "lecture";
  if (re("\\bпр(?:\\.|\\s|$)|практик").test(lower)) return "practice";
  if (re("\\bлаб(?:\\.|\\s|$)|лабораторн").test(lower)) return "lab";
  return "other";
}

export function lessonTitle(summary: string): string | null {
  const title = sanitizeTitle(summary);
  if (!title) return null;
  return title.replace(re("^(?:лек(?:ция)?|пр(?:актика)?|лаб(?:ораторная)?)\\.?(?=\\s|$)\\s*", "i"), "").trim() || null;
}

export function subjectKey(title: string | null): string | null {
  if (!title) return null;
  return title.toLowerCase().replace(/[^\p{L}\p{N}_\s]/gu, "").replace(/\s+/gu, " ").trim() || null;
}

/** Тот же id, что в Python: sha1(uid|начало в ISO с поясом), первые 16 символов. */
export async function lessonId(uid: string, start: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(`${uid}|${start}${MOSCOW_OFFSET}`));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
}

const hhmm = (stamp: string) => stamp.slice(11, 16);
const shift = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

export interface DaySchedule {
  for_date: string;
  has_lessons: boolean;
  first_lesson: string | null;
  first_title: string | null;
  first_room: string | null;
  lessons_count: number;
  alarm_slot: string | null;
  all_slots: string[];
  warning: string | null;
  notification: string;
}

export interface AlarmPayload extends DaySchedule {
  generated_at: string;
  tomorrow: DaySchedule;
}

/** Будильник на день: min(первая пара − подготовка, latest_alarm), самый поздний слот не позже этого. */
export function daySchedule(events: IcalEvent[], date: string, cfg: AlarmConfig = ALARM_CONFIG): DaySchedule {
  const day = events
    .filter((e) => e.start.slice(0, 10) === date && isUserEvent(e, cfg))
    .sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
  const base = { for_date: date, all_slots: cfg.slots };
  if (day.length === 0) {
    return {
      ...base,
      has_lessons: false,
      first_lesson: null,
      first_title: null,
      first_room: null,
      lessons_count: 0,
      alarm_slot: null,
      warning: null,
      notification: "Пар нет, будильник выключен",
    };
  }

  const first = day[0];
  const firstLesson = hhmm(first.start);
  const target = Math.min(toMinutes(firstLesson) - cfg.prep_minutes, toMinutes(cfg.latest_alarm));
  const valid = cfg.slots.filter((s) => toMinutes(s) <= target);
  let slot = valid[valid.length - 1];
  let warning: string | null = null;
  if (!slot) {
    slot = cfg.slots[0];
    const t = ((target % 1440) + 1440) % 1440;
    warning = `Первая пара в ${firstLesson} — будильник на ${slot} может быть поздним (расчётное время ${pad(Math.floor(t / 60))}:${pad(t % 60)})`;
  }
  return {
    ...base,
    has_lessons: true,
    first_lesson: firstLesson,
    first_title: sanitizeTitle(first.summary),
    first_room: sanitizeRoom(first.location),
    lessons_count: day.length,
    alarm_slot: slot,
    warning,
    notification: `Первая пара в ${firstLesson}, будильник на ${slot}${warning ? `. Внимание: ${warning}` : ""}`,
  };
}

/** Тот же schedule.json, что публиковался на GitHub Pages: на сегодня и поле tomorrow. */
export function alarmPayload(events: IcalEvent[], today: string, generatedAt: string, cfg: AlarmConfig = ALARM_CONFIG): AlarmPayload {
  const { for_date, has_lessons, first_lesson, first_title, first_room, lessons_count, alarm_slot, all_slots, warning, notification } =
    daySchedule(events, today, cfg);
  return {
    generated_at: generatedAt,
    for_date,
    has_lessons,
    first_lesson,
    first_title,
    first_room,
    lessons_count,
    alarm_slot,
    all_slots,
    warning,
    notification,
    tomorrow: daySchedule(events, shift(today, 1), cfg),
  };
}

/** Пары на lessons_horizon_days дней с сегодняшнего — то же, что schedule_alarm.py отправлял в /push. */
export async function lessonsPayload(events: IcalEvent[], today: string, generatedAt: string, cfg: AlarmConfig = ALARM_CONFIG): Promise<LessonsPayload> {
  const last = shift(today, cfg.lessons_horizon_days - 1);
  const mine = events.filter((e) => e.start.slice(0, 10) >= today && e.start.slice(0, 10) <= last && isUserEvent(e, cfg));
  const lessons = await Promise.all(
    mine.map(async (e) => {
      const title = lessonTitle(e.summary);
      return {
        id: await lessonId(e.uid, e.start),
        date: e.start.slice(0, 10),
        start: hhmm(e.start),
        end: e.end ? hhmm(e.end) : null,
        // В Python пустое название — null; боту нужна строка.
        title: title ?? "",
        subject_key: subjectKey(title),
        type: classifyLesson(e.summary),
        room: sanitizeRoom(e.location),
      };
    }),
  );
  lessons.sort((a, b) => (a.date + a.start < b.date + b.start ? -1 : a.date + a.start > b.date + b.start ? 1 : 0));
  return { generated_at: generatedAt, from: today, to: last, lessons };
}

/**
 * Ночные обновления по Москве: 02:00 — как раньше запускался GitHub Actions, 03:30 — последний шанс
 * подхватить ночные изменения до 04:00, когда iPhone забирает файл. Неудача — повтор на следующем тике cron.
 */
export const ALARM_SYNC_TIMES = ["02:00", "03:30"];

export function alarmSyncDue(now: { date: string; time: string }, stored: AlarmPayload | null): boolean {
  if (!stored || stored.for_date !== now.date) return true;
  const generated = stored.generated_at.slice(0, 16);
  return ALARM_SYNC_TIMES.some((t) => now.time >= t && generated < `${now.date}T${t}`);
}

const USER_AGENT = "Mozilla/5.0 (compatible; DSTUScheduleBot/1.0; +https://github.com/ekwsod/DONSTU_ICAL_URL)";

/** Скачивает календарь. Ссылку никогда не пишем в логи и ошибки — в ней ключ доступа. */
export async function fetchIcal(url: string): Promise<IcalEvent[]> {
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`ical HTTP ${response.status}`);
  const events = parseIcal(await response.text());
  if (events.length === 0) throw new Error("ical: 0 events");
  return events;
}
