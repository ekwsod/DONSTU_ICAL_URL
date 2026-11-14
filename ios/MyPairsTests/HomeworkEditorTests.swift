import XCTest
@testable import MyPairs

final class HomeworkEditorTests: XCTestCase {
    private let first = Lesson(id: "first", date: "2026-11-12", start: "08:30", end: "10:05", title: "Математика", type: "lecture", room: nil)
    private let second = Lesson(id: "second", date: "2026-11-12", start: "12:00", end: "13:35", title: "Математика", type: "practice", room: nil)
    private let future = Lesson(id: "future", date: "2026-11-20", start: "10:15", end: nil, title: "Математика", type: "lab", room: nil)

    func testContextualEntryPinsPastLessonAndExactTime() throws {
        var form = HomeworkEditorState(initial: second, now: Dates.date("2026-11-15"))
        XCTAssertFalse(form.automatic)
        form.text = "  Задачи 1–5  "
        // Even accidental state changes cannot redirect the submitted context.
        form.due = Dates.date("2026-11-30")
        form.subject = "Другой предмет"
        let submission = try XCTUnwrap(form.submission(in: [first, second, future]))
        XCTAssertEqual(submission, HomeworkSubmission(lessonID: "second", dueDate: "2026-11-12", text: "Задачи 1–5"))
    }
    func testRemovedContextIsNotSilentlyRedirected() {
        var form = HomeworkEditorState(initial: second)
        form.text = "Отчёт"
        XCTAssertNil(form.submission(in: [first, future]))
    }
    func testManualDateWithoutLessonKeepsDateAndSubjectAnchor() throws {
        var form = HomeworkEditorState(now: Dates.date("2026-11-13"))
        form.automatic = false
        form.selectSubject("Математика", lessons: [future, first], now: Dates.date("2026-11-13"))
        XCTAssertEqual(form.lessonID, future.id)
        form.due = Dates.date("2026-11-21")
        form.alignLessonToDate(in: [future, first])
        XCTAssertEqual(form.lessonID, "")
        form.text = "Отчёт"
        let submission = try XCTUnwrap(form.submission(in: [future, first]))
        XCTAssertEqual(submission.lessonID, "first")
        XCTAssertEqual(submission.dueDate, "2026-11-21")
    }
    func testManualChoiceKeepsSecondSameSubjectLesson() throws {
        var form = HomeworkEditorState(now: Dates.date(first.date))
        form.automatic = false
        form.selectSubject(first.title, lessons: [first, second], now: Dates.date(first.date))
        form.lessonID = second.id
        form.alignLessonToDate(in: [first, second])
        form.text = "К практике"
        XCTAssertEqual(form.submission(in: [first, second])?.lessonID, second.id)
    }
    func testDraftUsesLinkedLessonDateInsteadOfToday() {
        var form = HomeworkEditorState(now: Dates.date("2026-11-13"))
        let draft = HomeworkDraft(subject_key: nil, title: future.title, items: ["Отчёт"], due_date: nil, due_lesson_id: future.id)
        form.apply(draft, lessons: [first, second, future], now: Dates.date("2026-11-13"))
        XCTAssertEqual(Dates.key(form.due), future.date)
        XCTAssertEqual(form.submission(in: [first, second, future])?.lessonID, future.id)
    }
    func testUnknownDraftSubjectRequiresExplicitChoice() {
        var form = HomeworkEditorState()
        form.apply(HomeworkDraft(subject_key: nil, title: "Нет такого предмета", items: ["Задание"], due_date: "2026-11-20", due_lesson_id: nil), lessons: [first])
        XCTAssertEqual(form.subject, "")
        XCTAssertNil(form.submission(in: [first]))
    }
    func testEmptyAndServerLengthLimitAreEnforced() {
        var form = HomeworkEditorState(initial: first)
        form.text = " \n "
        XCTAssertNil(form.submission(in: [first]))
        form.text = String(repeating: "😀", count: 1001)
        XCTAssertNil(form.submission(in: [first]))
        form.text = String(repeating: "a", count: 2000)
        XCTAssertNotNil(form.submission(in: [first]))
    }
}
