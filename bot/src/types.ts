import type { HomeworkDraft } from "./ai";

export interface Env {
  AI: Ai;
  SCHEDULE: KVNamespace;
  BOT_TOKEN: string;
  OWNER_CHAT_ID: string;
  WEBHOOK_SECRET: string;
  PUSH_TOKEN: string;
  /** Ссылка на iCal группы (секрет). Без неё будильник не считается, пары ждут /push. */
  ICAL_URL?: string;
  /** Координаты для прогноза погоды (по умолчанию — главный корпус ДГТУ). */
  WEATHER_LAT: string;
  WEATHER_LON: string;
}

export type LessonType = "lecture" | "practice" | "lab" | "other";

export interface Lesson {
  id: string;
  date: string; // YYYY-MM-DD
  start: string; // HH:MM
  end: string | null;
  title: string;
  subject_key: string | null;
  type: LessonType;
  room: string | null;
}

export interface LessonsPayload {
  generated_at?: string;
  /** Окно дат списка (YYYY-MM-DD, включительно). */
  from?: string;
  to?: string;
  lessons: Lesson[];
}

/** Дз хранит копию предмета и даты, чтобы не теряться, когда пара уходит из окна расписания. */
export interface Homework {
  id: string;
  text: string;
  title: string;
  subject_key: string | null;
  from_lesson_id: string;
  due_date: string; // YYYY-MM-DD
  due_lesson_id: string | null;
  done: boolean;
}

/** Режим выбора срока дз: спрашивать, всегда следующая пара, всегда следующая лекция. */
export type DueMode = "ask" | "next" | "lecture";

export interface Settings {
  due_mode: DueMode;
  /** За сколько минут до первой пары присылать погоду; 0 — не присылать. */
  weather_lead: number;
  /** Час (по Москве), когда накануне напоминать о дз на завтра; 0 — не напоминать. */
  hw_remind_hour: number;
}

/**
 * Состояние диалога добавления дз: либо «➕ дз» у пары (lesson_id, затем text),
 * либо дз, написанное свободным текстом и разобранное ИИ (draft, ждёт подтверждения).
 */
export interface Pending {
  lesson_id?: string;
  text?: string;
  draft?: HomeworkDraft;
}
