import { describe, expect, it } from "vitest";
import { Store } from "../src/store";
import type { Homework, Lesson, LessonsPayload } from "../src/types";

class MemoryKv {
  values = new Map<string, string>();
  async get(key: string) { return this.values.get(key) ?? null; }
  async put(key: string, value: string) { this.values.set(key, value); }
  async delete(key: string) { this.values.delete(key); }
}

const lesson = (over: Partial<Lesson>): Lesson => ({
  id: "old", date: "2026-11-10", start: "10:15", end: "11:50", title: "Математика",
  subject_key: "математика", type: "lecture", room: "1-101", ...over,
});
const payload = (lessons: Lesson[]): LessonsPayload => ({ lessons });
const homework = (due_lesson_id: string | null): Homework => ({
  id: "h", text: "задачи 1–5", title: "Математика", subject_key: "математика", from_lesson_id: "",
  due_date: "2026-11-10", due_lesson_id, done: false,
});

describe("перепривязка дз после обновления расписания", () => {
  it("переносит срок и пару по source_uid, даже на другой день", async () => {
    const kv = new MemoryKv();
    const store = new Store(kv as unknown as KVNamespace);
    await store.putLessons(payload([lesson({ id: "old", source_uid: "event-1" })]));
    await store.putHomework([homework("old")]);

    await store.putLessons(payload([lesson({ id: "new", source_uid: "event-1", date: "2026-11-12", start: "12:00" })]));

    expect(await store.getHomework()).toMatchObject([{ due_lesson_id: "new", due_date: "2026-11-12" }]);
  });

  it("для старых пар без UID переносит только к единственной паре предмета в тот же день", async () => {
    const kv = new MemoryKv();
    const store = new Store(kv as unknown as KVNamespace);
    await store.putLessons(payload([lesson({ id: "old" })]));
    await store.putHomework([homework("old")]);
    await store.putLessons(payload([lesson({ id: "new", start: "12:00" })]));
    expect((await store.getHomework())[0].due_lesson_id).toBe("new");
  });

  it("восстанавливает уже оторванное старое дз при единственном безопасном совпадении", async () => {
    const kv = new MemoryKv();
    const store = new Store(kv as unknown as KVNamespace);
    await store.putHomework([homework("id-из-старого-расписания")]);
    await store.putLessons(payload([lesson({ id: "new" })]));
    expect((await store.getHomework())[0].due_lesson_id).toBe("new");
  });

  it("не угадывает, если в день несколько одинаковых предметов или пара отменена", async () => {
    const kv = new MemoryKv();
    const store = new Store(kv as unknown as KVNamespace);
    await store.putLessons(payload([lesson({ id: "old" })]));
    await store.putHomework([homework("old")]);
    await store.putLessons(payload([lesson({ id: "a" }), lesson({ id: "b", start: "12:00" })]));
    expect((await store.getHomework())[0].due_lesson_id).toBe("old");
  });
});
