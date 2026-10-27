import type { Lesson } from "./types";

/** Погода за день и по часам; ключи — «YYYY-MM-DD» и «YYYY-MM-DDTHH:00» (время московское). */
export interface Forecast {
  daily: Record<string, { code: number; min: number; max: number; precip: number }>;
  hourly: Record<string, { temp: number; feels: number; code: number; precip: number }>;
}

/** Ответ Open-Meteo в объёме, который запрашиваем. */
interface OpenMeteoResponse {
  daily: {
    time: string[];
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_probability_max: (number | null)[];
  };
  hourly: {
    time: string[];
    temperature_2m: number[];
    apparent_temperature: number[];
    weather_code: number[];
    precipitation_probability: (number | null)[];
  };
}

/** Начиная с этой вероятности осадков подсказываем про зонт. */
const UMBRELLA_PERCENT = 40;

export function forecastUrl(lat: string, lon: string): string {
  const params = new URLSearchParams({
    latitude: lat,
    longitude: lon,
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
    hourly: "temperature_2m,apparent_temperature,weather_code,precipitation_probability",
    timezone: "Europe/Moscow",
    forecast_days: "16",
  });
  return `https://api.open-meteo.com/v1/forecast?${params}`;
}

export function parseForecast(data: OpenMeteoResponse): Forecast {
  const forecast: Forecast = { daily: {}, hourly: {} };
  data.daily.time.forEach((date, i) => {
    forecast.daily[date] = {
      code: data.daily.weather_code[i],
      min: data.daily.temperature_2m_min[i],
      max: data.daily.temperature_2m_max[i],
      precip: data.daily.precipitation_probability_max[i] ?? 0,
    };
  });
  data.hourly.time.forEach((time, i) => {
    forecast.hourly[time] = {
      temp: data.hourly.temperature_2m[i],
      feels: data.hourly.apparent_temperature[i],
      code: data.hourly.weather_code[i],
      precip: data.hourly.precipitation_probability[i] ?? 0,
    };
  });
  return forecast;
}

/** Значок и подпись по коду погоды WMO. */
export function describeWeather(code: number): { icon: string; label: string } {
  if (code === 0) return { icon: "☀️", label: "ясно" };
  if (code <= 2) return { icon: "🌤", label: "переменная облачность" };
  if (code === 3) return { icon: "☁️", label: "пасмурно" };
  if (code <= 48) return { icon: "🌫", label: "туман" };
  if (code <= 57) return { icon: "🌦", label: "морось" };
  if (code <= 67) return { icon: "🌧", label: "дождь" };
  if (code <= 77) return { icon: "❄️", label: "снег" };
  if (code <= 82) return { icon: "🌧", label: "ливень" };
  if (code <= 86) return { icon: "🌨", label: "снегопад" };
  return { icon: "⛈", label: "гроза" };
}

/** «+7°», «−3°», «0°». */
export function formatTemp(value: number): string {
  const t = Math.round(value);
  if (t > 0) return `+${t}°`;
  if (t < 0) return `−${Math.abs(t)}°`;
  return "0°";
}

/** Короткая метка для кнопки дня: «☁️ +17°». */
export function weatherBadge(forecast: Forecast, date: string): string | null {
  const day = forecast.daily[date];
  if (!day) return null;
  return `${describeWeather(day.code).icon} ${formatTemp(day.max)}`;
}

const pad = (n: number) => String(n).padStart(2, "0");

function hourLine(forecast: Forecast, date: string, hour: number, prefix: string): string | null {
  const h = forecast.hourly[`${date}T${pad(hour)}:00`];
  if (!h) return null;
  const feels = Math.round(h.feels) !== Math.round(h.temp) ? `, ощущается ${formatTemp(h.feels)}` : "";
  const rain = h.precip >= UMBRELLA_PERCENT ? `, ☔ ${h.precip}%` : "";
  return `${prefix} (${pad(hour)}:00): ${describeWeather(h.code).icon} ${formatTemp(h.temp)}${feels}${rain}`;
}

/** Погода для дня: `top` — над расписанием (сводка, к первой паре), `after` — под ним (после пар). */
export interface DayWeather {
  top: string[];
  after: string | null;
}

/**
 * Погода к началу первой пары берётся на час начала (округление вниз),
 * после последней — на час окончания (округление вверх). null — дня нет в прогнозе.
 */
export function dayWeather(forecast: Forecast, date: string, lessons: Lesson[]): DayWeather | null {
  const day = forecast.daily[date];
  if (!day) return null;

  const { icon, label } = describeWeather(day.code);
  const rain = day.precip >= UMBRELLA_PERCENT ? ` · ☔ осадки ${day.precip}%, возьми зонт` : "";
  const range = `${formatTemp(day.min).replace("°", "")}…${formatTemp(day.max)}`; // «+7…+17°»
  const result: DayWeather = { top: [`${icon} ${label}, ${range}${rain}`], after: null };

  if (lessons.length > 0) {
    const sorted = [...lessons].sort((a, b) => a.start.localeCompare(b.start));
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const startHour = Number(first.start.slice(0, 2));
    const end = last.end ?? last.start;
    const endHour = Math.min(23, Number(end.slice(0, 2)) + (end.slice(3) === "00" ? 0 : 1));

    const toFirst = hourLine(forecast, date, startHour, "🚶 К первой паре");
    if (toFirst) result.top.push(toFirst);
    result.after = hourLine(forecast, date, endHour, "🏠 После пар");
  }
  return result;
}

/** Загрузка прогноза. Любая ошибка — null: без погоды бот всё равно работает. */
export async function fetchForecast(lat: string, lon: string): Promise<Forecast | null> {
  try {
    const response = await fetch(forecastUrl(lat, lon), { signal: AbortSignal.timeout(5000) });
    if (!response.ok) return null;
    return parseForecast((await response.json()) as OpenMeteoResponse);
  } catch {
    return null;
  }
}
