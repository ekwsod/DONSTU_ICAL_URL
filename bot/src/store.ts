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

  putLessons(payload: LessonsPayload): Promise<void> {
    return this.write(KEYS.lessons, payload);
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
