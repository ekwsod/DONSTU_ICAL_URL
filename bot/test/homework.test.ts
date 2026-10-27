import { describe, expect, it } from "vitest";
import { autoDue, dueOptions, makeHomework, openHomework } from "../src/homework";
import type { Homework, Lesson } from "../src/types";

const lesson = (over: Partial<Lesson>): Lesson => ({
  id: "x",
  date: "2026-11-02",
  start: "08:30",
  end: "10:00",
  title: "Математика",
  subject_key: "математика",
  type: "lecture",
  room: null,
  ...over,
});

const lessons = [
  lesson({ id: "a", date: "2026-11-02", type: "practice" }),
  lesson({ id: "b", date: "2026-11-04", type: "practice" }),
  lesson({ id: "c", date: "2026-11-06", type: "lecture" }),
];

describe("dueOptions", () => {
  it("предлагает следующую пару и следующую лекцию", () => {
    const options = dueOptions(lessons, lessons[0]);
    expect(options.map((o) => [o.kind, o.lesson.id])).toEqual([
      ["next", "b"],
      ["lecture", "c"],
    ]);
  });

  it("без ключа предмета вариантов нет", () => {
    expect(dueOptions(lessons, lesson({ subject_key: null }))).toEqual([]);
  });
});

describe("autoDue", () => {
  it("в режиме ask не выбирает срок сам", () => {
    expect(autoDue(lessons, lessons[0], "ask")).toBeNull();
  });

  it("в режиме next берёт следующую пару, в режиме lecture — лекцию", () => {
    expect(autoDue(lessons, lessons[0], "next")?.id).toBe("b");
    expect(autoDue(lessons, lessons[0], "lecture")?.id).toBe("c");
  });

  it("возвращает null, если лекции в окне нет", () => {
    expect(autoDue(lessons, lessons[2], "lecture")).toBeNull();
  });
});

describe("makeHomework / openHomework", () => {
  it("копирует предмет и срок, открытые сортирует по сроку", () => {
    const h1 = makeHomework("1", "задачи 1-5", lessons[0], { date: "2026-11-06", lesson: lessons[2] });
    const h2 = makeHomework("2", "реферат", lessons[0], { date: "2026-11-04", lesson: null });
    const done: Homework = { ...h2, id: "3", done: true };

    expect(h1).toMatchObject({ title: "Математика", subject_key: "математика", due_lesson_id: "c", done: false });
    expect(h2.due_lesson_id).toBeNull();
    expect(openHomework([h1, h2, done]).map((h) => h.id)).toEqual(["2", "1"]);
  });
});
