import type { AlarmPayload } from "./alarm";
import type { Homework, LessonsPayload, Pending, Settings } from "./types";
import type { Forecast } from "./weather";

const KEYS = {
  lessons: "lessons",
  homework: "homework",
  settings: "settings",
  pending: "pending",
  weather: "weather",
  weatherSent: "weather_sent",
  homeworkReminded: "hw_reminded",
  alarm: "alarm",
} as const;

/** Прогноз живёт в KV час, потом запрашивается заново. */
const WEATHER_TTL_SECONDS = 60 * 60;

const DEFAULT_SETTINGS: Settings = { due_mode: "ask", weather_lead: 60, hw_remind_hour: 20 };

/** Обёртка над KV: один пользователь, поэтому каждая сущность — один JSON-ключ. */
export class Store {
  constructor(private kv: KVNamespace) {}

  private async read<T>(key: string): Promise<T | null> {
    const raw = await this.kv.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  }

  private write(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    return this.kv.put(key, JSON.stringify(value), ttlSeconds ? { expirationTtl: ttlSeconds } : undefined);
  }

  getWeather(): Promise<Forecast | null> {
    return this.read<Forecast>(KEYS.weather);
  }

  putWeather(forecast: Forecast): Promise<void> {
    return this.write(KEYS.weather, forecast, WEATHER_TTL_SECONDS);
  }

  /** Дата (YYYY-MM-DD), когда последний раз присылали погоду перед выходом. */
  getWeatherSent(): Promise<string | null> {
    return this.read<string>(KEYS.weatherSent);
  }

  putWeatherSent(date: string): Promise<void> {
    return this.write(KEYS.weatherSent, date);
  }

  /** Дата (YYYY-MM-DD), когда последний раз напоминали о дз на завтра. */
  getHomeworkReminded(): Promise<string | null> {
    return this.read<string>(KEYS.homeworkReminded);
  }

  putHomeworkReminded(date: string): Promise<void> {
    return this.write(KEYS.homeworkReminded, date);
  }

  getLessons(): Promise<LessonsPayload | null> {
    return this.read<LessonsPayload>(KEYS.lessons);
  }

  /**
   * Портал меняет id пары при переносе: он зависит от времени начала. Перед заменой расписания
   * перепривязываем открытое дз к той же VEVENT по source_uid. Старые записи без UID трогаем
   * только при единственном совпадении предмета в тот же день — без рискованных догадок.
   */
  async putLessons(payload: LessonsPayload): Promise<void> {
    const [previous, homework] = await Promise.all([this.getLessons(), this.getHomework()]);
    const ids = new Set(payload.lessons.map((lesson) => lesson.id));
    const oldById = new Map(previous?.lessons.map((lesson) => [lesson.id, lesson]) ?? []);

    const relinked = homework.map((item) => {
      if (item.done || !item.due_lesson_id || ids.has(item.due_lesson_id)) return item;
      const old = oldById.get(item.due_lesson_id);
      let candidates = old?.source_uid
        ? payload.lessons.filter((lesson) => lesson.source_uid === old.source_uid)
        : [];
      if (candidates.length !== 1) {
        candidates = payload.lessons.filter((lesson) => lesson.date === item.due_date && lesson.subject_key === item.subject_key);
      }
      if (candidates.length !== 1) return item;

      const target = candidates[0];
      return { ...item, due_date: target.date, due_lesson_id: target.id };
    });

    await Promise.all([
      this.write(KEYS.lessons, payload),
      relinked.some((item, index) => item !== homework[index]) ? this.putHomework(relinked) : Promise.resolve(),
    ]);
  }

  /** schedule.json для быстрой команды iPhone. */
  getAlarm(): Promise<AlarmPayload | null> {
    return this.read<AlarmPayload>(KEYS.alarm);
  }

  putAlarm(payload: AlarmPayload): Promise<void> {
    return this.write(KEYS.alarm, payload);
  }

  async getHomework(): Promise<Homework[]> {
    return (await this.read<Homework[]>(KEYS.homework)) ?? [];
  }

  putHomework(list: Homework[]): Promise<void> {
    return this.write(KEYS.homework, list);
  }

  async getSettings(): Promise<Settings> {
    return { ...DEFAULT_SETTINGS, ...(await this.read<Settings>(KEYS.settings)) };
  }

  putSettings(settings: Settings): Promise<void> {
    return this.write(KEYS.settings, settings);
  }

  getPending(): Promise<Pending | null> {
    return this.read<Pending>(KEYS.pending);
  }

  putPending(pending: Pending): Promise<void> {
    return this.write(KEYS.pending, pending);
  }

  clearPending(): Promise<void> {
    return this.kv.delete(KEYS.pending);
  }
}
