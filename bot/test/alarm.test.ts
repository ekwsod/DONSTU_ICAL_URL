import { describe, expect, it } from "vitest";
import {
  alarmPayload,
  alarmSyncDue,
  daySchedule,
  extractSubgroup,
  lessonId,
  lessonsPayload,
  parseIcal,
  parseIcalDate,
  sanitizeTitle,
  type DaySchedule,
} from "../src/alarm";
import type { Lesson } from "../src/types";
import parity from "./fixtures/parity.json";

/**
 * Ожидаемый результат посчитан schedule_alarm.py на том же календаре (parity.json → ics):
 * Worker обязан давать ровно то же, что Python, — те же будильники и те же id пар.
 */
const expected = parity as unknown as {
  days: Record<string, DaySchedule>;
  lessons: { from: string; to: string; lessons: (Omit<Lesson, "title"> & { title: string | null })[] };
};
const events = parseIcal(parity.ics);

describe("будильник как в schedule_alarm.py", () => {
  it("расчёт по дням совпадает", () => {
    for (const [date, day] of Object.entries(expected.days)) {
      expect(daySchedule(events, date), date).toEqual(day);
    }
  });

  it("список пар для бота совпадает, включая id (на них держатся дз)", async () => {
    const payload = await lessonsPayload(events, "2026-11-02", "now");
    expect(payload.from).toBe(expected.lessons.from);
    expect(payload.to).toBe(expected.lessons.to);
    // Единственное отличие: пустое название в Python — null, бот хранит пустую строку.
    expect(payload.lessons).toEqual(expected.lessons.lessons.map((l) => ({ ...l, title: l.title ?? "" })));
  });

  it("schedule.json: сегодня плюс tomorrow", () => {
    const payload = alarmPayload(events, "2026-11-02", "2026-11-02T02:00:00+03:00");
    expect(payload).toEqual({
      generated_at: "2026-11-02T02:00:00+03:00",
      ...expected.days["2026-11-02"],
      tomorrow: expected.days["2026-11-03"],
    });
  });
});

describe("разбор iCal", () => {
  it("UTC переводится в Москву, в том числе через полночь", () => {
    expect(parseIcalDate("20261017T053000Z")).toBe("2026-10-17T08:30:00");
    expect(parseIcalDate("20261231T220000Z")).toBe("2027-01-01T01:00:00");
    expect(parseIcalDate("20261017T083000")).toBe("2026-10-17T08:30:00");
    expect(parseIcalDate("20261017")).toBeNull();
  });

  it("не календарь — ошибка, а не пустое расписание", () => {
    expect(() => parseIcal("<html>Сервис недоступен</html>")).toThrow();
  });

  it("подгруппы и ФИО — с кириллицей, как в Python", () => {
    expect(extractSubgroup("пр Информатика (п/г 1)")).toBe(1);
    expect(extractSubgroup("Химия 2 п/г")).toBe(2);
    expect(extractSubgroup("Химия ПОДГРУППА 2")).toBe(2);
    expect(extractSubgroup("Высшая математика")).toBeNull();
    expect(sanitizeTitle("лек Высшая математика Петров А.Б.")).toBe("лек Высшая математика");
    expect(sanitizeTitle("пр Информатика (п/г 1) БВТ2101")).toBe("пр Информатика");
  });

  it("id пары: sha1 от uid и начала с поясом", async () => {
    expect(await lessonId("a2", "2026-11-02T10:15:00")).toBe(expected.lessons.lessons[0].id);
  });
});

describe("когда пересчитывать будильник", () => {
  const stored = (generated_at: string, for_date = "2026-10-30") =>
    ({ ...expected.days["2026-11-02"], for_date, generated_at, tomorrow: expected.days["2026-11-03"] });

  it("нет файла или он вчерашний — сразу", () => {
    expect(alarmSyncDue({ date: "2026-10-30", time: "00:05" }, null)).toBe(true);
    expect(alarmSyncDue({ date: "2026-10-30", time: "00:05" }, stored("2026-10-29T03:30:00+03:00", "2026-10-29"))).toBe(true);
  });

  it("ночью в 02:00 и 03:30 — по разу, днём больше не трогаем", () => {
    const at = (time: string, generated: string) => alarmSyncDue({ date: "2026-10-30", time }, stored(`2026-10-30T${generated}:00+03:00`));
    expect(at("01:55", "00:05")).toBe(false);
    expect(at("02:00", "00:05")).toBe(true);
    expect(at("02:05", "02:00")).toBe(false);
    expect(at("03:30", "02:00")).toBe(true);
    expect(at("12:00", "03:30")).toBe(false);
    // Ночью портал не ответил — пробуем дальше и днём.
    expect(at("12:00", "00:05")).toBe(true);
  });
});
