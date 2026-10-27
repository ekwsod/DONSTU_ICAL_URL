import type { Lesson, LessonsPayload } from "./types";

/** Список дат от `from` (включительно), длиной `days`, в формате YYYY-MM-DD. */
export function dayWindow(from: string, days: number): string[] {
  const result: string[] = [];
  const start = new Date(`${from}T00:00:00Z`);
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    result.push(d.toISOString().slice(0, 10));
  }
  return result;
}

/** Все пары, сгруппированные по дате. */
export function lessonsByDate(payload: LessonsPayload): Map<string, Lesson[]> {
  const map = new Map<string, Lesson[]>();
  for (const lesson of payload.lessons) {
    const list = map.get(lesson.date) ?? [];
    list.push(lesson);
    map.set(lesson.date, list);
  }
  return map;
}

/**
 * Ближайшая пара с тем же предметом строго после (date, start).
 * Если `type` задан, учитываются только пары этого типа (для «следующей лекции»).
 */
export function findNextLesson(
  lessons: Lesson[],
  after: Pick<Lesson, "date" | "start">,
  subjectKey: string,
  type?: Lesson["type"],
): Lesson | null {
  const candidates = lessons
    .filter((l) => l.subject_key === subjectKey)
    .filter((l) => (type ? l.type === type : true))
    .filter((l) => l.date > after.date || (l.date === after.date && l.start > after.start))
    .sort((a, b) => (a.date === b.date ? a.start.localeCompare(b.start) : a.date.localeCompare(b.date)));
  return candidates[0] ?? null;
}
