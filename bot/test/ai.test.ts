import { describe, expect, it } from "vitest";
import {
  cleanComment,
  draftHomework,
  draftText,
  draftToHomework,
  dueKindFromText,
  homeworkPrompt,
  parseHomeworkAnswer,
  planComment,
  planFacts,
  resolveDue,
  stripThinking,
  subjectsFrom,
  type AiRunner,
} from "../src/ai";
import { morningText } from "../src/morning";
import { escapeHtml } from "../src/ui";
import type { Homework, Lesson } from "../src/types";

const lesson = (id: string, date: string, start: string, over: Partial<Lesson> = {}): Lesson => ({
  id,
  date,
  start,
  end: null,
  title: "Высшая математика",
  subject_key: "высшая математика",
  type: "practice",
  room: "1-111",
  ...over,
});

const chem = { title: "Химия", subject_key: "химия" };
const lessons = [
  lesson("m1", "2026-10-28", "10:15", { type: "lecture" }),
  lesson("c1", "2026-10-28", "08:30", { ...chem, type: "lab" }),
  lesson("m2", "2026-10-30", "08:30"),
  lesson("m3", "2026-11-02", "12:00", { type: "lecture" }),
  lesson("c2", "2026-11-04", "08:30", { ...chem, type: "lab" }),
];
const now = { date: "2026-10-28", time: "09:00" };

/** Подставная модель: возвращает заранее заданный ответ и запоминает, что у неё спросили. */
const fakeRunner = (answer: string | null) => {
  const calls: Parameters<AiRunner>[] = [];
  const run: AiRunner = async (...args) => {
    calls.push(args);
    return answer;
  };
  return { run, calls };
};

describe("subjectsFrom", () => {
  it("уникальные предметы по алфавиту", () => {
    expect(subjectsFrom(lessons)).toEqual([
      { key: "высшая математика", title: "Высшая математика" },
      { key: "химия", title: "Химия" },
    ]);
  });
});

describe("parseHomeworkAnswer", () => {
  it("принимает валидный JSON, в том числе внутри лишнего текста", () => {
    expect(parseHomeworkAnswer('Вот: {"subject_index":1,"due":"next","date":"","items":[" отчёт "]}', 2)).toEqual({
      subject_index: 1,
      due: "next",
      date: "",
      items: ["отчёт"],
    });
  });

  it("отбрасывает то, чему нельзя верить: номер вне списка, чужой срок, кривую дату", () => {
    expect(parseHomeworkAnswer('{"subject_index":7,"due":"завтра","date":"пятница","items":[1,"",  "ок"]}', 2)).toEqual({
      subject_index: -1,
      due: "none",
      date: "",
      items: ["ок"],
    });
  });

  it("не JSON — null", () => {
    expect(parseHomeworkAnswer("не понял", 2)).toBeNull();
    expect(parseHomeworkAnswer("{сломано", 2)).toBeNull();
  });
});

describe("resolveDue", () => {
  it("следующая пара предмета после текущего момента", () => {
    expect(resolveDue(lessons, now, "высшая математика", "next", "", "ask")).toEqual({
      due_date: "2026-10-28",
      due_lesson_id: "m1",
      due_label: "следующая пара",
    });
  });

  it("к лекции — пропускает практики", () => {
    expect(resolveDue(lessons, { date: "2026-10-29", time: "00:00" }, "высшая математика", "lecture", "", "ask").due_lesson_id).toBe("m3");
  });

  it("дата в окне — привязка к паре этого дня; без пары — просто дата", () => {
    expect(resolveDue(lessons, now, "высшая математика", "date", "2026-10-30", "ask")).toMatchObject({
      due_lesson_id: "m2",
      due_label: "пара в этот день",
    });
    expect(resolveDue(lessons, now, "высшая математика", "date", "2026-10-31", "ask")).toEqual({
      due_date: "2026-10-31",
      due_lesson_id: null,
      due_label: "к этой дате",
    });
  });

  it("дата в прошлом или за окном расписания игнорируется, срок по умолчанию — из настроек", () => {
    expect(resolveDue(lessons, now, "высшая математика", "date", "2026-10-01", "ask").due_lesson_id).toBe("m1");
    expect(resolveDue(lessons, now, "высшая математика", "date", "2027-01-01", "lecture").due_lesson_id).toBe("m1");
    expect(resolveDue(lessons, { date: "2026-10-29", time: "00:00" }, "высшая математика", "none", "", "lecture").due_label).toBe(
      "следующая лекция",
    );
  });

  it("пар предмета впереди нет — срок пустой", () => {
    expect(resolveDue(lessons, { date: "2026-11-05", time: "00:00" }, "химия", "next", "", "ask").due_date).toBeNull();
  });
});

describe("draftHomework", () => {
  it("ответ модели → черновик с предметом, пунктами и сроком; модели дан список предметов и дат", async () => {
    const { run, calls } = fakeRunner('{"subject_index":0,"due":"date","date":"2026-10-30","items":["номера 1-5","конспект §3"]}');
    const draft = await draftHomework(run, "матан к пятнице 1-5 и конспект", now, lessons, "ask");
    expect(draft).toEqual({
      subject_key: "высшая математика",
      title: "Высшая математика",
      items: ["номера 1-5", "конспект §3"],
      due_date: "2026-10-30",
      due_lesson_id: "m2",
      due_label: "пара в этот день",
    });
    const [messages, schema] = calls[0];
    expect(schema?.name).toBe("homework");
    expect(messages[0].content).toContain("0: Высшая математика");
    expect(messages[0].content).toContain("2026-10-30 — пятница");
    expect(messages[1].content).toBe("матан к пятнице 1-5 и конспект");
  });

  it("модель не ответила — весь текст одним пунктом, предмет и срок пустые", async () => {
    const draft = await draftHomework(fakeRunner(null).run, "  что-то по химии  ", now, lessons, "ask");
    expect(draft).toEqual({
      subject_key: null,
      title: null,
      items: ["что-то по химии"],
      due_date: null,
      due_lesson_id: null,
      due_label: null,
    });
  });
});

describe("карточка черновика", () => {
  const draft = {
    subject_key: "высшая математика",
    title: "Высшая математика",
    items: ["номера 1-5", "a < b"],
    due_date: "2026-10-30",
    due_lesson_id: "m2",
    due_label: "пара в этот день",
  };

  it("предмет, пункты, срок с парой и аудиторией", () => {
    expect(draftText(draft, lessons, escapeHtml)).toBe(
      [
        "✍️ <b>Записать так?</b>",
        "",
        "📝 <b>Высшая математика</b>",
        "• номера 1-5",
        "• a &lt; b",
        "",
        "📅 Срок: <b>Пт 30, 08:30, корпус 1, ауд. 111</b> <i>(пара в этот день)</i>",
      ].join("\n"),
    );
  });

  it("без предмета и срока — подсказки, сохранить нельзя", () => {
    const empty = { ...draft, subject_key: null, title: null, due_date: null, due_lesson_id: null, due_label: null };
    const text = draftText(empty, lessons, escapeHtml);
    expect(text).toContain("Предмет не понял — выбери ниже");
    expect(text).toContain("не нашёл пару — выбери дату");
    expect(draftToHomework("x", empty)).toBeNull();
  });

  it("подтверждённый черновик → дз, пункты через «; »", () => {
    expect(draftToHomework("x", draft)).toEqual({
      id: "x",
      text: "номера 1-5; a < b",
      title: "Высшая математика",
      subject_key: "высшая математика",
      from_lesson_id: "",
      due_date: "2026-10-30",
      due_lesson_id: "m2",
      done: false,
    });
  });
});

describe("комментарий к плану", () => {
  const today = lessons.filter((l) => l.date === "2026-10-28");
  const due: Homework = {
    id: "1",
    text: "отчёт по лабе",
    title: "Химия",
    subject_key: "химия",
    from_lesson_id: "",
    due_date: "2026-10-28",
    due_lesson_id: "c1",
    done: false,
  };

  it("факты для модели: пары по порядку и на какой паре сдавать (без времени сдачи)", () => {
    const facts = planFacts(today, { top: ["☁️ пасмурно, +7…+17°"], after: null }, [due]);
    expect(facts).toContain("- 08:30–? Химия (лаба)\n- 10:15–? Высшая математика (лекция)");
    expect(facts).toContain("- Химия: отчёт по лабе (сдать на 1-й паре дня)");
  });

  it("чистит ответ: размышления, markdown, кавычки, длину", () => {
    expect(stripThinking("<think>хм</think>\nОк")).toBe("Ок");
    expect(stripThinking("хм, думаю...</think>Ок")).toBe("Ок");
    expect(cleanComment('«**Возьми** зонт»')).toBe("Возьми зонт");
    expect(cleanComment("слово ".repeat(80))!.length).toBeLessThanOrEqual(300);
    expect(cleanComment("   ")).toBeNull();
  });

  it("модель молчит — комментария нет, план уходит без строки 💬", async () => {
    expect(await planComment(fakeRunner(null).run, today, null, [])).toBeNull();
    expect(morningText(today[1], today, null, [], null)).not.toContain("💬");
  });

  it("комментарий — последней строкой плана, курсивом и с экранированием", async () => {
    const comment = await planComment(fakeRunner("Возьми зонт & не забудь отчёт").run, today, null, [due]);
    expect(morningText(today[1], today, null, [due], comment).split("\n").at(-1)).toBe(
      "💬 <i>Возьми зонт &amp; не забудь отчёт</i>",
    );
  });
});

describe("dueKindFromText", () => {
  it("слова в тексте сильнее ответа модели, кроме явной даты", () => {
    expect(dueKindFromText("к следующей лекции по матеше глава 4", "next")).toBe("lecture");
    expect(dueKindFromText("к след паре отчёт", "none")).toBe("next");
    expect(dueKindFromText("к пятнице, на лекции спросят", "date")).toBe("date");
    expect(dueKindFromText("задачи 1-5", "none")).toBe("none");
  });

  it("в черновике: модель сказала next, а в тексте лекция — срок по лекции", async () => {
    const run: AiRunner = async () => '{"subject_index":0,"due":"next","date":"","items":["глава 4"]}';
    const draft = await draftHomework(run, "к лекции по матеше глава 4", { date: "2026-10-29", time: "00:00" }, lessons, "ask");
    expect(draft.due_lesson_id).toBe("m3");
    expect(draft.due_label).toBe("следующая лекция");
  });
});

describe("homeworkPrompt", () => {
  it("даёт ближайшие пары предмета, чтобы модель понимала «к лекции»", () => {
    const [system] = homeworkPrompt("x", "2026-10-28", subjectsFrom(lessons), lessons);
    expect(system.content).toContain("Сегодня 2026-10-28, среда.");
    expect(system.content).toContain("1: Химия (ближайшие: 2026-10-28 лаба, 2026-11-04 лаба)");
  });
});
