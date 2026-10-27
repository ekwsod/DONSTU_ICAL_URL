import { describe, expect, it } from "vitest";
import { lessonToWarnAbout, morningText, moscowNow } from "../src/morning";
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
      time: ["2026-10-28T08:00", "2026-10-28T11:00"],
      temperature_2m: [6, 10],
      apparent_temperature: [3, 10],
      weather_code: [61, 3],
      precipitation_probability: [60, 10],
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

  it("первая пара, погода с зонтом и дз на сегодня", () => {
    const text = morningText(lesson("2026-10-28", "08:30"), today, forecast, [homework]);
    expect(text).toContain("⏰ <b>Скоро выходить</b>");
    expect(text).toContain("Первая пара в <b>08:30</b>: Химия, ауд. 1-483");
    expect(text).toContain("🌧 дождь, +5…+12° · ☔ осадки 70%, возьми зонт");
    expect(text).toContain("🚶 К первой паре (08:00): 🌧 +6°, ощущается +3°, ☔ 60%");
    expect(text).toContain("<b>Сегодня сдавать:</b>\n📝 Химия: отчёт по лабе");
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
  it("отмечает текущий режим дз и время погоды", () => {
    const kb = settingsKeyboard({ due_mode: "next", weather_lead: 45 });
    const labels = kb.inline_keyboard.map((row) => row.map((b) => b.text));
    expect(labels[1]).toEqual(["✅ Всегда к следующей паре"]);
    expect(labels[3]).toEqual(["Выкл", "30 мин", "✅ 45 мин", "60 мин", "90 мин"]);
  });
});
