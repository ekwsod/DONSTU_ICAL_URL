import { describe, expect, it } from "vitest";
import { buildWeekKeyboard, dayText, longDate, shiftDate } from "../src/ui";
import type { Homework, Lesson } from "../src/types";

const lesson: Lesson = {
  id: "L1",
  date: "2026-11-02",
  start: "08:30",
  end: "10:00",
  title: "Математика",
  subject_key: "математика",
  type: "lecture",
  room: "1-234",
};

const hw = (over: Partial<Homework>): Homework => ({
  id: "h",
  text: "задачи",
  title: "Математика",
  subject_key: "математика",
  from_lesson_id: "L0",
  due_date: "2026-11-02",
  due_lesson_id: "L1",
  done: false,
  ...over,
});

describe("даты", () => {
  it("сдвиг работает в обе стороны через границу месяца", () => {
    expect(shiftDate("2026-11-01", -1)).toBe("2026-10-31");
    expect(shiftDate("2026-10-31", 1)).toBe("2026-11-01");
  });

  it("длинная дата по-русски", () => {
    expect(longDate("2026-11-02")).toBe("2 ноября, понедельник");
  });
});

describe("buildWeekKeyboard", () => {
  it("две строки по 7 кнопок с пометками сегодня, без пар и дз", () => {
    const kb = buildWeekKeyboard("2026-10-28", new Set(["2026-10-29"]), new Set(["2026-10-30"]), "dd");
    const rows = kb.inline_keyboard.filter((r) => r.length > 0);
    expect(rows.map((r) => r.length)).toEqual([7, 7]);
    const [today, withLessons, withHw, empty] = rows[0];
    expect(today.text).toBe("•Ср 28");
    expect(withLessons.text).toBe("Чт 29");
    expect(withHw.text).toBe("📌Пт 30");
    expect(empty.text).toBe("·Сб 31");
    expect((today as { callback_data: string }).callback_data).toBe("dd:2026-10-28");
  });
});

describe("dayText", () => {
  it("показывает пару и дз под ней, остальные дз дня — отдельно", () => {
    const text = dayText("2026-11-02", [lesson], [
      hw({ id: "1", text: "задачи 1-5" }),
      hw({ id: "2", text: "эссе", title: "Философия", due_lesson_id: null }),
      hw({ id: "3", text: "сдано", done: true }),
    ]);
    expect(text).toContain("08:30–10:00 Математика (лекция, ауд. 1-234)");
    expect(text).toContain("   📝 задачи 1-5");
    expect(text).toContain("Дз на этот день:\n📝 Философия: эссе");
    expect(text).not.toContain("сдано");
  });

  it("пишет, что пар нет", () => {
    expect(dayText("2026-11-01", [], [])).toContain("Пар нет");
  });
});
