import { describe, expect, it } from "vitest";
import { homeworkToRemind, lessonToWarnAbout, morningText, moscowNow, nextStudyDate, reminderText } from "../src/morning";
import { parseForecast } from "../src/weather";
import { settingsKeyboard, todaySummary } from "../src/ui";
import type { Homework, Lesson } from "../src/types";

const lesson = (date: string, start: string, over: Partial<Lesson> = {}): Lesson => ({
  id: `${date}-${start}`,
  date,
  start,
  end: "10:05",
  title: "Химия",
  subject_key: "химия",
  type: "lab",
  room: "1-483",
  ...over,
});

const lessons = [lesson("2026-10-28", "10:15"), lesson("2026-10-28", "08:30"), lesson("2026-10-29", "10:15")];
const at = (time: string, date = "2026-10-28") => ({ date, time });

describe("moscowNow", () => {
  it("переводит UTC в московское время, в том числе через полночь", () => {
    expect(moscowNow(Date.parse("2026-10-27T22:30:00Z"))).toEqual({ date: "2026-10-28", time: "01:30" });
  });
});

describe("lessonToWarnAbout", () => {
  it("срабатывает в окне за lead минут до первой пары дня", () => {
    expect(lessonToWarnAbout(at("07:29"), lessons, 60, null)).toBeNull();
    expect(lessonToWarnAbout(at("07:30"), lessons, 60, null)?.start).toBe("08:30");
    expect(lessonToWarnAbout(at("08:29"), lessons, 60, null)?.start).toBe("08:30");
    expect(lessonToWarnAbout(at("08:30"), lessons, 60, null)).toBeNull();
  });

  it("не шлёт второй раз за день, при выключенной настройке и в день без пар", () => {
    expect(lessonToWarnAbout(at("07:45"), lessons, 60, "2026-10-28")).toBeNull();
    expect(lessonToWarnAbout(at("07:45"), lessons, 0, null)).toBeNull();
    expect(lessonToWarnAbout(at("07:45", "2026-11-01"), lessons, 60, null)).toBeNull();
  });

  it("вчерашняя отметка не мешает сегодня", () => {
    expect(lessonToWarnAbout(at("09:30", "2026-10-29"), lessons, 60, "2026-10-28")?.date).toBe("2026-10-29");
  });
});

describe("morningText", () => {
  const forecast = parseForecast({
    daily: {
      time: ["2026-10-28"],
      weather_code: [61],
      temperature_2m_max: [12],
      temperature_2m_min: [5],
      precipitation_probability_max: [70],
    },
    hourly: {
      time: ["2026-10-28T08:00", "2026-10-28T11:00", "2026-10-28T16:00"],
      temperature_2m: [6, 10, 11],
      apparent_temperature: [3, 10, 11],
      weather_code: [61, 3, 3],
      precipitation_probability: [60, 10, 10],
    },
  });
  const homework: Homework = {
    id: "1",
    text: "отчёт по лабе",
    title: "Химия",
    subject_key: "химия",
    from_lesson_id: "x",
    due_date: "2026-10-28",
    due_lesson_id: null,
    done: false,
  };
  const today = lessons.filter((l) => l.date === "2026-10-28");

  it("план дня: погода, пары с местом, окно, дз под парой и время окончания", () => {
    const day = [
      lesson("2026-10-28", "08:30", { id: "chem", end: "10:05" }),
      lesson("2026-10-28", "10:15", { id: "math", end: "11:50", title: "Математика", type: "lecture", room: "1-35а" }),
      lesson("2026-10-28", "14:15", { id: "pe", end: "15:50", title: "Физкультура", type: "practice", room: "манеж" }),
    ];
    const text = morningText(day[0], day, forecast, [
      { ...homework, id: "2", text: "задачи 1-5", title: "Математика", due_lesson_id: "math" },
      homework,
    ]);
    expect(text).toBe(
      [
        "⏰ <b>Скоро выходить</b> — первая пара в <b>08:30</b> (ауд. 1-483)",
        "",
        "<blockquote>🌧 дождь, +5…+12° · ☔ осадки 70%, возьми зонт",
        "🚶 К первой паре (08:00): 🌧 +6°, ощущается +3°, ☔ 60%</blockquote>",
        "",
        "<b>План на сегодня</b> (3 пары, до 15:50):",
        "<b>1 пара · 08:30–10:05</b> — 🧪 Химия (лаба)",
        "📍 корпус 1, ауд. 483",
        "<b>2 пара · 10:15–11:50</b> — 📘 Математика (лекция)",
        "📍 корпус 1, ауд. 35а",
        "📝 сдать: задачи 1-5",
        "☕ окно 11:50–14:15 (2 ч 25 мин)",
        "<b>4 пара · 14:15–15:50</b> — ✏️ Физкультура (практика)",
        "📍 манеж",
        "🏁 Пары закончатся в 15:50",
        "<blockquote>🏠 После пар (16:00): ☁️ +11°</blockquote>",
        "",
        "<b>Ещё сдать сегодня:</b>",
        "📝 Химия: отчёт по лабе",
      ].join("\n"),
    );
  });

  it("в заголовке без номера аудитории — как есть, без аудитории — ничего", () => {
    const pe = lesson("2026-10-28", "08:30", { room: "манеж" });
    expect(morningText(pe, [pe], null, []).split("\n")[0]).toBe("⏰ <b>Скоро выходить</b> — первая пара в <b>08:30</b> (манеж)");
    const none = lesson("2026-10-28", "08:30", { room: null });
    expect(morningText(none, [none], null, []).split("\n")[0]).toBe("⏰ <b>Скоро выходить</b> — первая пара в <b>08:30</b>");
  });

    it("обед в 40 минут — не окно", () => {
    const day = [
      lesson("2026-10-28", "12:00", { id: "a", end: "13:35" }),
      lesson("2026-10-28", "14:15", { id: "b", end: "15:50" }),
    ];
    expect(morningText(day[0], day, forecast, [])).not.toContain("окно");
  });

  it("без прогноза честно говорит, что погоды нет", () => {
    expect(morningText(lesson("2026-10-28", "08:30"), today, null, [])).toContain("Погоду сейчас не получить");
  });
});

describe("todaySummary", () => {
  it("число пар, первая пара и погода", () => {
    expect(todaySummary("2026-10-28", today(), "☁️ +17°")).toBe(
      "📅 Сегодня, 28 октября: 2 пары, первая в 08:30 · ☁️ +17°",
    );
    expect(todaySummary("2026-11-01", [], null)).toBe("📅 Сегодня, 1 ноября: пар нет 🎉");
  });

  function today() {
    return lessons.filter((l) => l.date === "2026-10-28");
  }
});

describe("settingsKeyboard", () => {
  it("отмечает текущий режим дз, время погоды и напоминаний", () => {
    const kb = settingsKeyboard({ due_mode: "next", weather_lead: 45, hw_remind_hour: 0 });
    const labels = kb.inline_keyboard.map((row) => row.map((b) => b.text));
    expect(labels[1]).toEqual(["✅ Всегда к следующей паре"]);
    expect(labels[3]).toEqual(["🌤", "Выкл", "30м", "✅ 45м", "60м", "90м"]);
    expect(labels[4]).toEqual(["🔔", "✅ Выкл", "18:00", "20:00", "22:00"]);
    expect(labels[5]).toEqual(["👀 Пример плана перед выходом"]);
  });
});

describe("nextStudyDate", () => {
  it("сегодня, если есть пары, иначе ближайший следующий день с парами", () => {
    expect(nextStudyDate(lessons, "2026-10-28")).toBe("2026-10-28");
    expect(nextStudyDate(lessons, "2026-10-29")).toBe("2026-10-29");
    expect(nextStudyDate(lessons, "2026-10-30")).toBeNull();
  });
});

describe("homeworkToRemind", () => {
  const hw = (id: string, due_date: string, done = false): Homework => ({
    id,
    text: "задачи",
    title: "Химия",
    subject_key: "химия",
    from_lesson_id: "x",
    due_date,
    due_lesson_id: "2026-10-29-10:15",
    done,
  });
  const list = [hw("1", "2026-10-29"), hw("2", "2026-10-29", true), hw("3", "2026-10-30")];

  it("в окне с выбранного часа — только открытые дз на завтра", () => {
    expect(homeworkToRemind(at("19:59"), list, 20, null)).toEqual([]);
    expect(homeworkToRemind(at("20:00"), list, 20, null).map((h) => h.id)).toEqual(["1"]);
    expect(homeworkToRemind(at("21:55"), list, 20, null).map((h) => h.id)).toEqual(["1"]);
    expect(homeworkToRemind(at("22:00"), list, 20, null)).toEqual([]);
  });

  it("не повторяет в тот же день и молчит, если выключено", () => {
    expect(homeworkToRemind(at("20:05"), list, 20, "2026-10-28")).toEqual([]);
    expect(homeworkToRemind(at("20:05"), list, 0, null)).toEqual([]);
  });

  it("переход через месяц: 31 октября напоминает про 1 ноября", () => {
    expect(homeworkToRemind(at("20:00", "2026-10-31"), [hw("4", "2026-11-01")], 20, null)).toHaveLength(1);
  });

  it("текст: предмет, время пары и задание", () => {
    expect(reminderText([list[0]], lessons)).toBe("🔔 <b>Завтра сдавать</b> (1):\n📝 Химия — к 10:15: задачи");
  });
});
