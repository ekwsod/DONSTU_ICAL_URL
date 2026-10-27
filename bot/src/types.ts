export interface Env {
  SCHEDULE: KVNamespace;
  BOT_TOKEN: string;
  OWNER_CHAT_ID: string;
  WEBHOOK_SECRET: string;
  PUSH_TOKEN: string;
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
}

/** Состояние диалога добавления дз (между нажатием «➕ дз» и выбором срока). */
export interface Pending {
  lesson_id: string;
  text?: string;
}
