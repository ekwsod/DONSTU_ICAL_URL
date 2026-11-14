import Foundation

struct HomeworkSubmission: Equatable {
    let lessonID: String
    let dueDate: String
    let text: String
    var payload: [String: Any] { ["action": "add", "lesson_id": lessonID, "due_date": dueDate, "text": text] }
}

struct HomeworkEditorState {
    let pinned: Lesson?
    var automatic: Bool
    var subject: String
    var lessonID: String
    var due: Date
    var text = ""

    init(initial: Lesson? = nil, now: Date = Date()) {
        pinned = initial
        automatic = initial == nil
        subject = initial?.title ?? ""
        lessonID = initial?.id ?? ""
        due = initial.map { Dates.date($0.date) } ?? now
    }

    func subjectLessons(in lessons: [Lesson]) -> [Lesson] {
        lessons.filter { $0.title == subject }.sorted { $0.date + $0.start + $0.id < $1.date + $1.start + $1.id }
    }
    func dateLessons(in lessons: [Lesson]) -> [Lesson] {
        subjectLessons(in: lessons).filter { $0.date == Dates.key(due) }
    }
    mutating func selectSubject(_ title: String, lessons: [Lesson], now: Date = Date()) {
        guard pinned == nil else { return }
        subject = title
        let available = subjectLessons(in: lessons)
        let first = available.first { $0.date >= Dates.key(now) } ?? available.last
        lessonID = first?.id ?? ""
        if let first { due = Dates.date(first.date) }
    }
    mutating func alignLessonToDate(in lessons: [Lesson]) {
        guard pinned == nil else { return }
        let onDate = dateLessons(in: lessons)
        if !onDate.contains(where: { $0.id == lessonID }) { lessonID = onDate.first?.id ?? "" }
    }
    mutating func apply(_ draft: HomeworkDraft, lessons: [Lesson], now: Date = Date()) {
        guard pinned == nil else { return }
        text = draft.items.joined(separator: "\n")
        if let linked = lessons.first(where: { $0.id == draft.due_lesson_id }) {
            subject = linked.title
            due = draft.due_date.map(Dates.date) ?? Dates.date(linked.date)
            lessonID = linked.id
        } else {
            subject = lessons.contains(where: { $0.title == draft.title }) ? (draft.title ?? "") : ""
            let available = subjectLessons(in: lessons)
            let first = available.first { $0.date >= Dates.key(now) } ?? available.last
            due = draft.due_date.map(Dates.date) ?? first.map { Dates.date($0.date) } ?? now
            lessonID = ""
        }
        alignLessonToDate(in: lessons)
        automatic = false
    }
    func submission(in lessons: [Lesson]) -> HomeworkSubmission? {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !automatic, !trimmed.isEmpty, text.utf16.count <= 2000 else { return nil }
        if let pinned {
            // Never silently redirect a contextual entry to another lesson/date.
            guard lessons.contains(where: { $0.id == pinned.id }) else { return nil }
            return HomeworkSubmission(lessonID: pinned.id, dueDate: pinned.date, text: trimmed)
        }
        let available = subjectLessons(in: lessons)
        let onDate = dateLessons(in: lessons)
        guard let anchor = onDate.first(where: { $0.id == lessonID }) ?? onDate.first ?? available.first else { return nil }
        return HomeworkSubmission(lessonID: anchor.id, dueDate: Dates.key(due), text: trimmed)
    }
}
