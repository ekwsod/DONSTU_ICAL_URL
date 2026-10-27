import { describe, expect, it } from "vitest";
import {
  dayKeyboard,
  dayText,
  escapeHtml,
  mainMenu,
  longDate,
  mondayOf,
  shiftDate,
  weekKeyboard,
  weekOffsetOf,
  weekTitle,
  weeksKeyboard,
} from "../src/ui";
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

const labels = (kb: { inline_keyboard: { text: string }[][] }) => kb.inline_keyboard.map((row) => row.map((b) => b.text));
const data = (kb: { inline_keyboard: object[][] }) =>
  kb.inline_keyboard.flat().map((b) => (b as { callback_data: string }).callback_data);

describe("даты", () => {
  it("сдвиг работает в обе стороны через границу месяца", () => {
    expect(shiftDate("2026-11-01", -1)).toBe("2026-10-31");
    expect(shiftDate("2026-10-31", 1)).toBe("2026-11-01");
  });

  it("длинная дата по-русски", () => {
    expect(longDate("2026-11-02")).toBe("2 ноября, понедельник");
  });

  it("понедельник недели и номер недели относительно сегодня", () => {
    expect(mondayOf("2026-10-28")).toBe("2026-10-26"); // среда → понедельник
    expect(mondayOf("2026-11-01")).toBe("2026-10-26"); // воскресенье той же недели
    expect(weekOffsetOf("2026-10-28", "2026-11-01")).toBe(0);
    expect(weekOffsetOf("2026-10-28", "2026-11-02")).toBe(1);
  });

  it("заголовок недели", () => {
    expect(weekTitle("2026-10-28", 0)).toBe("Эта неделя: 26 окт – 1 ноя");
    expect(weekTitle("2026-10-28", 1)).toBe("Следующая неделя: 2 ноя – 8 ноя");
  });
});

describe("weekKeyboard", () => {
  const week = {
    lessons: new Map([
      ["2026-10-28", 2],
      ["2026-10-29", 1],
      ["2026-10-30", 5],
    ]),
    homework: new Map([["2026-10-29", 1]]),
    weather: new Map([["2026-10-30", "☁️ +17°"]]),
  };

  it("по кнопке на день с числом пар, дз и погодой, пустое воскресенье скрыто", () => {
    const rows = labels(weekKeyboard("2026-10-28", 0, week));
    expect(rows.slice(0, 6).map((r) => r[0])).toEqual([
      "Пн 26 окт · нет пар",
      "Вт 27 окт · нет пар",
      "• Ср 28 окт · 2 пары",
      "Чт 29 окт · 1 пара · 📝1",
      "Пт 30 окт · 5 пар · ☁️ +17°",
      "Сб 31 окт · нет пар",
    ]);
    expect(rows[6]).toEqual(["🗓 Недели", "▶"]);
    expect(rows).toHaveLength(7);
  });

  it("стрелки листают недели, «Недели» открывает выбор", () => {
    const kb = weekKeyboard("2026-10-28", 1, week);
    expect(labels(kb).at(-1)).toEqual(["◀", "🗓 Недели", "▶"]);
    expect(data(kb).slice(-3)).toEqual(["w:0", "wk", "w:2"]);
    expect(labels(weekKeyboard("2026-10-28", 3, week)).at(-1)).toEqual(["◀", "🗓 Недели"]);
  });

  it("в режиме выбора срока кнопки ведут на dd: и dw:, есть отмена", () => {
    const callbacks = data(weekKeyboard("2026-10-28", 0, week, "due"));
    expect(callbacks[0]).toBe("dd:2026-10-26");
    expect(callbacks).toContain("dw:1");
    expect(callbacks.at(-1)).toBe("due:cancel");
  });
});

describe("меню и выбор недели", () => {
  it("в меню сначала дни, потом недели, дз и настройки", () => {
    expect(mainMenu().keyboard.map((row) => row.map((b) => (typeof b === "string" ? b : b.text)))).toEqual([
      ["📍 Сегодня", "➡️ Завтра"],
      ["🗓 Недели", "📝 Мои дз", "⚙️"],
    ]);
  });

  it("выбор недели: эта, следующая и дальше", () => {
    const kb = weeksKeyboard("2026-10-28");
    expect(labels(kb).slice(0, 2)).toEqual([["Эта неделя: 26 окт – 1 ноя"], ["Следующая неделя: 2 ноя – 8 ноя"]]);
    expect(data(kb)).toEqual(["w:0", "w:1", "w:2", "w:3"]);
  });
});

describe("dayText", () => {
  it("каждая пара — блок с номером, временем и предметом жирным", () => {
    const text = dayText("2026-11-02", [lesson], [
      hw({ id: "1", text: "задачи 1-5" }),
      hw({ id: "2", text: "эссе", title: "Философия", due_lesson_id: null }),
      hw({ id: "3", text: "сдано", done: true }),
    ]);
    expect(text).toBe(
      [
        "🗓 <b>2 ноября, понедельник</b>",
        "",
        "<b>1 пара · 08:30–10:00</b>",
        "📘 <b>Математика</b>",
        "<i>лекция · корпус 1, ауд. 234</i>",
        "📝 задачи 1-5",
        "",
        "<b>Дз на этот день</b>",
        "📝 Философия: эссе",
      ].join("\n"),
    );
  });

  it("экранирует HTML в тексте дз", () => {
    expect(dayText("2026-11-02", [lesson], [hw({ text: "a < b & c" })])).toContain("📝 a &lt; b &amp; c");
    expect(escapeHtml("<b>")).toBe("&lt;b&gt;");
  });

  it("погода: сводка под заголовком, после пар — под расписанием", () => {
    const text = dayText("2026-11-02", [lesson], [hw({ text: "эссе", due_lesson_id: null })], {
      top: ["☁️ пасмурно, +7…+17°"],
      after: "🏠 После пар (10:00): ☀️ +12°",
    });
    const blocks = text.split("\n\n");
    expect(blocks[0]).toBe("🗓 <b>2 ноября, понедельник</b>\n☁️ пасмурно, +7…+17°");
    expect(blocks[2]).toBe("🏠 После пар (10:00): ☀️ +12°");
    expect(blocks[3]).toBe("<b>Дз на этот день</b>\n📝 Математика: эссе");
  });

  it("пишет, что пар нет", () => {
    expect(dayText("2026-11-01", [], [])).toContain("Пар нет");
  });
});

describe("dayKeyboard", () => {
  it("кнопки «➕ дз» по номеру пары, дз дня и возврат к нужной неделе", () => {
    const kb = dayKeyboard("2026-10-28", "2026-11-02", [lesson], [hw({ id: "1", text: "задачи" })]);
    expect(labels(kb)).toEqual([
      ["➕ дз · 1 пара · Математика"],
      ["📝 Математика: задачи"],
      ["◀", "К неделе", "▶"],
    ]);
    expect(data(kb)).toEqual(["a:L1", "h:1", "d:2026-11-01", "w:1", "d:2026-11-03"]);
  });
});
