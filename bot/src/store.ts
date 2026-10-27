import type { Homework, LessonsPayload, Pending, Settings } from "./types";

const KEYS = {
  lessons: "lessons",
  homework: "homework",
  settings: "settings",
  pending: "pending",
} as const;

const DEFAULT_SETTINGS: Settings = { due_mode: "ask" };

/** Обёртка над KV: один пользователь, поэтому каждая сущность — один JSON-ключ. */
export class Store {
  constructor(private kv: KVNamespace) {}

  private async read<T>(key: string): Promise<T | null> {
    const raw = await this.kv.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  }

  private write(key: string, value: unknown): Promise<void> {
    return this.kv.put(key, JSON.stringify(value));
  }

  getLessons(): Promise<LessonsPayload | null> {
    return this.read<LessonsPayload>(KEYS.lessons);
  }

  putLessons(payload: LessonsPayload): Promise<void> {
    return this.write(KEYS.lessons, payload);
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
