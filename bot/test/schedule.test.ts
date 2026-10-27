import { describe, expect, it } from "vitest";
import { dayWindow, findNextLesson } from "../src/schedule";
import type { Lesson } from "../src/types";

const lesson = (over: Partial<Lesson>): Lesson => ({
  id: "x",
  date: "2026-11-02",
  start: "08:30",
  end: "10:00",
  title: "Математика",
  subject_key: "математика",
  type: "lecture",
  room: null,
  ...over,
});

describe("dayWindow", () => {
  it("возвращает 14 дней подряд, переходя через границу месяца", () => {
    const days = dayWindow("2026-10-28", 14);
    expect(days).toHaveLength(14);
    expect(days[0]).toBe("2026-10-28");
    expect(days[3]).toBe("2026-10-31");
    expect(days[4]).toBe("2026-11-01");
    expect(days[13]).toBe("2026-11-10");
  });
});

describe("findNextLesson", () => {
  const lessons = [
    lesson({ id: "a", date: "2026-11-02", start: "08:30", type: "lecture" }),
    lesson({ id: "b", date: "2026-11-03", start: "10:15", type: "practice" }),
    lesson({ id: "c", date: "2026-11-05", start: "08:30", type: "lecture" }),
    lesson({ id: "d", subject_key: "физика", date: "2026-11-03", start: "12:00" }),
  ];

  it("берёт ближайшую пару того же предмета после указанного времени", () => {
    const next = findNextLesson(lessons, { date: "2026-11-02", start: "08:30" }, "математика");
    expect(next?.id).toBe("b");
  });

  it("с фильтром по типу пропускает практики и берёт следующую лекцию", () => {
    const next = findNextLesson(lessons, { date: "2026-11-02", start: "08:30" }, "математика", "lecture");
    expect(next?.id).toBe("c");
  });

  it("возвращает null, если подходящих пар в списке нет", () => {
    expect(findNextLesson(lessons, { date: "2026-11-05", start: "08:30" }, "математика")).toBeNull();
  });
});
