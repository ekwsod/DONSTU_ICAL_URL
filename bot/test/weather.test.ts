import { describe, expect, it } from "vitest";
import { dayWeather, describeWeather, formatTemp, parseForecast, weatherBadge, type Forecast } from "../src/weather";
import type { Lesson } from "../src/types";

const lesson = (start: string, end: string): Lesson => ({
  id: start,
  date: "2026-10-28",
  start,
  end,
  title: "Математика",
  subject_key: "математика",
  type: "lecture",
  room: null,
});

const forecast: Forecast = parseForecast({
  daily: {
    time: ["2026-10-28", "2026-10-29"],
    weather_code: [3, 63],
    temperature_2m_max: [16.7, 4.2],
    temperature_2m_min: [7.0, -2.6],
    precipitation_probability_max: [6, 80],
  },
  hourly: {
    time: ["2026-10-28T08:00", "2026-10-28T14:00", "2026-10-29T10:00", "2026-10-29T12:00"],
    temperature_2m: [7.2, 15.4, 1.1, 0.4],
    apparent_temperature: [2.0, 15.1, -3.4, -4],
    weather_code: [3, 1, 63, 61],
    precipitation_probability: [0, null, 75, 90],
  },
});

describe("форматирование", () => {
  it("температура со знаком и типографским минусом", () => {
    expect(formatTemp(16.7)).toBe("+17°");
    expect(formatTemp(-2.6)).toBe("−3°");
    expect(formatTemp(0.4)).toBe("0°");
    expect(formatTemp(-0.4)).toBe("0°");
  });

  it("коды WMO в значок и подпись", () => {
    expect(describeWeather(0)).toEqual({ icon: "☀️", label: "ясно" });
    expect(describeWeather(3).label).toBe("пасмурно");
    expect(describeWeather(63).label).toBe("дождь");
    expect(describeWeather(75).label).toBe("снег");
    expect(describeWeather(95).label).toBe("гроза");
  });
});

describe("parseForecast", () => {
  it("пустая вероятность осадков считается нулём", () => {
    expect(forecast.hourly["2026-10-28T14:00"].precip).toBe(0);
    expect(forecast.daily["2026-10-29"]).toEqual({ code: 63, min: -2.6, max: 4.2, precip: 80 });
  });
});

describe("weatherBadge", () => {
  it("значок и максимум дня, вне прогноза — null", () => {
    expect(weatherBadge(forecast, "2026-10-28")).toBe("☁️ +17°");
    expect(weatherBadge(forecast, "2026-12-01")).toBeNull();
  });
});

describe("dayWeather", () => {
  it("сверху сводка и погода к первой паре, отдельно — после последней", () => {
    expect(dayWeather(forecast, "2026-10-28", [lesson("12:00", "13:35"), lesson("08:30", "10:05")])).toEqual({
      top: ["☁️ пасмурно, +7…+17°", "🚶 К первой паре (08:00): ☁️ +7°, ощущается +2°"],
      after: "🏠 После пар (14:00): 🌤 +15°",
    });
  });

  it("при дожде советует зонт и показывает вероятность по часам", () => {
    const weather = dayWeather(forecast, "2026-10-29", [lesson("10:15", "11:50")]);
    expect(weather?.top).toEqual([
      "🌧 дождь, −3…+4° · ☔ осадки 80%, возьми зонт",
      "🚶 К первой паре (10:00): 🌧 +1°, ощущается −3°, ☔ 75%",
    ]);
    expect(weather?.after).toBe("🏠 После пар (12:00): 🌧 0°, ощущается −4°, ☔ 90%");
  });

  it("без пар — только сводка, вне прогноза — null", () => {
    expect(dayWeather(forecast, "2026-10-28", [])).toEqual({ top: ["☁️ пасмурно, +7…+17°"], after: null });
    expect(dayWeather(forecast, "2026-12-01", [lesson("08:30", "10:05")])).toBeNull();
  });
});
