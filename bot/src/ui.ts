import { InlineKeyboard, Keyboard } from "grammy";
import type { DueOption } from "./homework";
import type { DueMode, Homework, Lesson, LessonType, Settings } from "./types";

const WEEKDAYS = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
const WEEKDAYS_FULL = ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"];
const MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
const MONTHS_SHORT = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

/** Сколько недель вперёд можно листать: пары приходят на 28 дней. */
export const MAX_WEEK_OFFSET = 3;

/** Тексты кнопок постоянного меню — по ним же бот ловит нажатия. */
export const MENU = {
  thisWeek: "📅 Эта неделя",
  nextWeek: "📅 Следующая",
  homework: "📝 Мои дз",
  settings: "⚙️ Настройки",
} as const;

const TYPE_LABELS: Record<LessonType, string> = {
  lecture: "лекция",
  practice: "практика",
  lab: "лаба",
  other: "",
};

const MODE_LABELS: Record<DueMode, string> = {
  ask: "Спрашивать каждый раз",
  next: "Всегда к следующей паре",
  lecture: "Всегда к следующей лекции",
};

const parse = (date: string) => new Date(`${date}T00:00:00Z`);

/** «Пн 2» — для коротких подписей. */
export function shortDate(date: string): string {
  const d = parse(date);
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()}`;
}

/** «2 ноября, понедельник» — для заголовков. */
export function longDate(date: string): string {
  const d = parse(date);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}, ${WEEKDAYS_FULL[d.getUTCDay()]}`;
}

/** «02.11» — для сроков в списках. */
export function dottedDate(date: string): string {
  return `${date.slice(8, 10)}.${date.slice(5, 7)}`;
}

export function shiftDate(date: string, days: number): string {
  const d = parse(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Понедельник недели, в которую попадает дата. */
export function mondayOf(date: string): string {
  const weekday = (parse(date).getUTCDay() + 6) % 7; // Пн = 0
  return shiftDate(date, -weekday);
}

/** Номер недели относительно текущей: 0 — эта, 1 — следующая. */
export function weekOffsetOf(today: string, date: string): number {
  const diff = parse(mondayOf(date)).getTime() - parse(mondayOf(today)).getTime();
  return Math.round(diff / (7 * 24 * 60 * 60 * 1000));
}

export function weekDates(today: string, offset: number): string[] {
  const monday = shiftDate(mondayOf(today), offset * 7);
  return Array.from({ length: 7 }, (_, i) => shiftDate(monday, i));
}

const pairs = (n: number) => {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} пара`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} пары`;
  return `${n} пар`;
};

export function weekTitle(today: string, offset: number): string {
  const days = weekDates(today, offset);
  const name = offset === 0 ? "Эта неделя" : offset === 1 ? "Следующая неделя" : `Через ${offset} нед.`;
  const range = (date: string) => `${parse(date).getUTCDate()} ${MONTHS_SHORT[parse(date).getUTCMonth()]}`;
  return `${name}: ${range(days[0])} – ${range(days[6])}`;
}

/** Однострочная сводка на сегодня: «📅 Сегодня, 28 октября: 2 пары, первая в 08:30 · ☁️ +17°». */
export function todaySummary(today: string, lessons: Lesson[], weather: string | null): string {
  const d = parse(today);
  const head = `📅 Сегодня, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
  const first = [...lessons].sort((a, b) => a.start.localeCompare(b.start))[0];
  const body = first ? `${pairs(lessons.length)}, первая в ${first.start}` : "пар нет 🎉";
  return `${head}: ${body}${weather ? ` · ${weather}` : ""}`;
}

export function mainMenu(): Keyboard {
  return new Keyboard()
    .text(MENU.thisWeek)
    .text(MENU.nextWeek)
    .row()
    .text(MENU.homework)
    .text(MENU.settings)
    .resized()
    .persistent();
}

export interface WeekData {
  lessons: Map<string, number>;
  homework: Map<string, number>;
  /** Метка погоды на день, например «☁️ +17°»; дней вне прогноза нет в карте. */
  weather?: Map<string, string>;
}

/**
 * Неделя: по кнопке на день с числом пар, дз и погодой, внизу переключение недель.
 * mode «view» открывает день, «due» выбирает дату срока дз.
 * Воскресенье без пар и дз скрыто, чтобы не занимать место.
 */
export function weekKeyboard(
  today: string,
  offset: number,
  data: WeekData,
  mode: "view" | "due" = "view",
): InlineKeyboard {
  const kb = new InlineKeyboard();
  const [dayAction, weekAction] = mode === "view" ? ["d", "w"] : ["dd", "dw"];

  for (const date of weekDates(today, offset)) {
    const lessons = data.lessons.get(date) ?? 0;
    const homework = data.homework.get(date) ?? 0;
    if (parse(date).getUTCDay() === 0 && lessons === 0 && homework === 0) continue;

    const parts = [`${date === today ? "• " : ""}${shortDate(date)} ${MONTHS_SHORT[parse(date).getUTCMonth()]}`];
    parts.push(lessons > 0 ? pairs(lessons) : "нет пар");
    if (homework > 0) parts.push(`📝${homework}`);
    const weather = data.weather?.get(date);
    if (weather) parts.push(weather);
    kb.text(parts.join(" · "), `${dayAction}:${date}`).row();
  }

  if (offset > 0) kb.text(offset === 1 ? "◀ Эта неделя" : "◀ Раньше", `${weekAction}:${offset - 1}`);
  if (offset < MAX_WEEK_OFFSET) kb.text(offset === 0 ? "Следующая ▶" : "Дальше ▶", `${weekAction}:${offset + 1}`);
  if (mode === "due") kb.row().text("Отмена", "due:cancel");
  return kb;
}

const TYPE_ICONS: Record<LessonType, string> = {
  lecture: "📘",
  practice: "✏️",
  lab: "🧪",
  other: "📌",
};

/** Начала пар в ДГТУ → номер пары. */
const PAIR_NUMBERS: Record<string, number> = {
  "08:30": 1,
  "10:15": 2,
  "12:00": 3,
  "14:15": 4,
  "16:00": 5,
  "17:45": 6,
  "19:30": 7,
};

export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function lessonBlock(lesson: Lesson, homework: Homework[]): string[] {
  const time = lesson.end ? `${lesson.start}–${lesson.end}` : lesson.start;
  const number = PAIR_NUMBERS[lesson.start];
  const details = [TYPE_LABELS[lesson.type], lesson.room ? `ауд. ${lesson.room}` : ""].filter(Boolean).join(" · ");

  const lines = [
    `<b>${number ? `${number} пара · ` : ""}${time}</b>`,
    `${TYPE_ICONS[lesson.type]} <b>${escapeHtml(lesson.title)}</b>`,
  ];
  if (details) lines.push(`<i>${escapeHtml(details)}</i>`);
  for (const h of homework) lines.push(`📝 ${escapeHtml(h.text)}`);
  return lines;
}

/**
 * Текст дня (HTML): заголовок с погодой, каждая пара — отдельный блок через пустую строку,
 * время и предмет жирным, под парой — дз со сроком на неё.
 */
export function dayText(date: string, lessons: Lesson[], homework: Homework[], weather: string[] = []): string {
  const blocks: string[][] = [[`🗓 <b>${longDate(date)}</b>`, ...weather.map(escapeHtml)]];
  const due = homework.filter((h) => !h.done && h.due_date === date);

  if (lessons.length === 0) {
    blocks.push(["Пар нет 🎉"]);
  }
  for (const lesson of lessons) {
    blocks.push(lessonBlock(lesson, due.filter((h) => h.due_lesson_id === lesson.id)));
  }

  const loose = due.filter((h) => !lessons.some((l) => l.id === h.due_lesson_id));
  if (loose.length > 0) {
    blocks.push([
      "<b>Дз на этот день</b>",
      ...loose.map((h) => `📝 ${escapeHtml(h.title)}: ${escapeHtml(h.text)}`),
    ]);
  }

  return blocks.map((b) => b.join("\n")).join("\n\n");
}

export function dayKeyboard(today: string, date: string, lessons: Lesson[], homework: Homework[]): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const lesson of lessons) {
    const number = PAIR_NUMBERS[lesson.start];
    kb.text(`➕ дз · ${number ? `${number} пара` : lesson.start} · ${lesson.title}`, `a:${lesson.id}`).row();
  }
  for (const h of homework.filter((h) => !h.done && h.due_date === date)) {
    kb.text(`📝 ${h.title}: ${h.text}`, `h:${h.id}`).row();
  }
  kb.text("◀", `d:${shiftDate(date, -1)}`)
    .text("К неделе", `w:${Math.max(0, weekOffsetOf(today, date))}`)
    .text("▶", `d:${shiftDate(date, 1)}`);
  return kb;
}

/** Меню срока: варианты по предмету плюс «Другая дата». */
export function dueKeyboard(options: DueOption[]): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const o of options) {
    const label = o.kind === "next" ? "К следующей паре" : "К следующей лекции";
    kb.text(`${label} (${shortDate(o.lesson.date)}, ${o.lesson.start})`, `due:${o.kind}`).row();
  }
  kb.text("Другая дата", "dw:0").row();
  kb.text("Отмена", "due:cancel");
  return kb;
}

export function homeworkText(list: Homework[]): string {
  if (list.length === 0) return "Открытых дз нет 🙌";
  return "Открытые дз — нажми, чтобы открыть:";
}

/** Список дз: каждое — кнопка, открывающая карточку. */
export function homeworkKeyboard(list: Homework[]): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const h of list) {
    kb.text(`до ${shortDate(h.due_date)} · ${h.title}: ${h.text}`, `h:${h.id}`).row();
  }
  return kb;
}

export function homeworkCardText(h: Homework, dueLesson: Lesson | null): string {
  const when = dueLesson ? `${longDate(h.due_date)}, ${dueLesson.start}` : longDate(h.due_date);
  const lines = [`📝 <b>${escapeHtml(h.title)}</b>`, "", escapeHtml(h.text), "", `<i>Срок: ${when}</i>`];
  if (h.done) lines.push("Сделано ✔");
  return lines.join("\n");
}

export function homeworkCardKeyboard(h: Homework): InlineKeyboard {
  return new InlineKeyboard()
    .text("✔ Сделано", `done:${h.id}`)
    .text("🗑 Удалить", `del:${h.id}`)
    .row()
    .text("📅 День сдачи", `d:${h.due_date}`)
    .text("◀ Все дз", "hl");
}

/** Варианты «за сколько минут до первой пары присылать погоду»; 0 — выключено. */
export const WEATHER_LEADS = [0, 30, 45, 60, 90];

export const SETTINGS_TEXT = [
  "<b>Настройки</b>",
  "",
  "📝 <b>Срок дз</b> — первые три кнопки.",
  "🌤 <b>Погода перед выходом</b> — нижний ряд: за сколько минут до первой пары написать.",
].join("\n");

export function settingsKeyboard(current: Settings): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const mode of Object.keys(MODE_LABELS) as DueMode[]) {
    kb.text(`${mode === current.due_mode ? "✅ " : ""}${MODE_LABELS[mode]}`, `set:${mode}`).row();
  }
  for (const lead of WEATHER_LEADS) {
    const label = lead === 0 ? "Выкл" : `${lead} мин`;
    kb.text(`${lead === current.weather_lead ? "✅ " : ""}${label}`, `wl:${lead}`);
  }
  return kb;
}
