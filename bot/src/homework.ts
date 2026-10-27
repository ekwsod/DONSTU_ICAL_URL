import { findNextLesson } from "./schedule";
import type { DueMode, Homework, Lesson } from "./types";

export interface DueOption {
  kind: "next" | "lecture";
  lesson: Lesson;
}

/** Варианты срока для дз к паре: следующая пара предмета и следующая лекция (если есть в окне). */
export function dueOptions(lessons: Lesson[], from: Lesson): DueOption[] {
  if (!from.subject_key) return [];
  const options: DueOption[] = [];
  const next = findNextLesson(lessons, from, from.subject_key);
  if (next) options.push({ kind: "next", lesson: next });
  const lecture = findNextLesson(lessons, from, from.subject_key, "lecture");
  if (lecture) options.push({ kind: "lecture", lesson: lecture });
  return options;
}

/** Срок по режиму из настроек. null — пусть пользователь выберет вручную. */
export function autoDue(lessons: Lesson[], from: Lesson, mode: DueMode): Lesson | null {
  if (mode === "ask") return null;
  return dueOptions(lessons, from).find((o) => o.kind === mode)?.lesson ?? null;
}

export function makeHomework(
  id: string,
  text: string,
  from: Lesson,
  due: { date: string; lesson: Lesson | null },
): Homework {
  return {
    id,
    text,
    title: from.title,
    subject_key: from.subject_key,
    from_lesson_id: from.id,
    due_date: due.date,
    due_lesson_id: due.lesson?.id ?? null,
    done: false,
  };
}

/** Открытые дз по возрастанию срока. */
export function openHomework(list: Homework[]): Homework[] {
  return list.filter((h) => !h.done).sort((a, b) => a.due_date.localeCompare(b.due_date));
}
