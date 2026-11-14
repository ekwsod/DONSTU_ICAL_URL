import Foundation
import Observation

struct Lesson: Codable, Identifiable, Hashable {
    let id: String
    let date: String
    let start: String
    let end: String?
    let title: String
    let type: String
    let room: String?
    var kind: String { ["lecture": "Лекция", "practice": "Практика", "lab": "Лабораторная"][type] ?? "Занятие" }
    var symbol: String { ["lecture": "text.book.closed", "practice": "pencil", "lab": "flask"][type] ?? "book" }
}
struct Homework: Codable, Identifiable {
    let id: String
    let text: String
    let title: String
    let due_date: String
    let due_lesson_id: String?
    let done: Bool
}
struct Snapshot: Codable {
    var lessons: [Lesson]
    var homework: [Homework]
    let generated_at: String?
}
struct HomeworkDraft: Decodable {
    let subject_key: String?
    let title: String?
    let items: [String]
    let due_date: String?
    let due_lesson_id: String?
}
enum Dates {
    static var calendar: Calendar {
        var c = Calendar(identifier: .gregorian); c.timeZone = TimeZone(identifier: "Europe/Moscow")!; c.firstWeekday = 2; return c
    }
    static func key(_ date: Date) -> String {
        let f = DateFormatter(); f.locale = Locale(identifier: "en_US_POSIX"); f.calendar = calendar; f.timeZone = calendar.timeZone; f.isLenient = false; f.dateFormat = "yyyy-MM-dd"; return f.string(from: date)
    }
    static func date(_ key: String) -> Date {
        let f = DateFormatter(); f.locale = Locale(identifier: "en_US_POSIX"); f.calendar = calendar; f.timeZone = calendar.timeZone; f.isLenient = false; f.dateFormat = "yyyy-MM-dd"; return f.date(from: key) ?? Date()
    }
    static func title(_ key: String) -> String {
        let f = DateFormatter(); f.locale = Locale(identifier: "ru_RU"); f.timeZone = calendar.timeZone; f.dateFormat = "d MMMM, EEEE"; return f.string(from: date(key))
    }
    static func minutes(_ time: String) -> Int {
        let parts = time.split(separator: ":").compactMap { Int($0) }; return parts.count == 2 ? parts[0] * 60 + parts[1] : 0
    }
}

@MainActor @Observable final class AppModel {
    var snapshot = Snapshot(lessons: [], homework: [], generated_at: nil)
    var needsLogin = false
    var loading = false
    var error: String?
    var offline = false
    let demo: Bool
    private let base = URL(string: "https://donstu-bot.dstujarvis.workers.dev")!
    private let session: URLSession
    private let cache: URL
    private var refreshTask: Task<Void, Never>?
    private var mutationTail: Task<Void, Never>?
    private var homeworkRevision = 0
    private var signingIn = false
    init(demo: Bool? = nil, session: URLSession = URLSession(configuration: .default), cacheURL: URL? = nil) {
        self.session = session
        self.cache = cacheURL ?? FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appendingPathComponent("schedule.json")
        self.demo = demo ?? ProcessInfo.processInfo.arguments.contains("--demo")
        if self.demo {
            let today = Dates.key(Date())
            let tomorrow = Dates.key(Dates.calendar.date(byAdding: .day, value: 1, to: Date()) ?? Date())
            let nextWeek = Dates.key(Dates.calendar.date(byAdding: .day, value: 3, to: Date()) ?? Date())
            snapshot = Snapshot(lessons: [
                Lesson(id: "a", date: today, start: "08:30", end: "10:05", title: "Высшая математика", type: "lecture", room: "8-402"),
                Lesson(id: "b", date: today, start: "10:15", end: "11:50", title: "Информатика и информационно-коммуникационные технологии", type: "lab", room: "1-143"),
                Lesson(id: "c", date: today, start: "14:15", end: "15:50", title: "Иностранный язык (английский), п/г 1", type: "practice", room: "2-305")], homework: [
                    Homework(id: "h", text: "Решить задачи 1–5, повторить производные", title: "Высшая математика", due_date: today, due_lesson_id: "a", done: false),
                    Homework(id: "h2", text: "Подготовить отчёт по лабораторной работе", title: "Информатика и информационно-коммуникационные технологии", due_date: tomorrow, due_lesson_id: nil, done: false),
                    Homework(id: "h3", text: "Выучить слова из модуля 3", title: "Иностранный язык", due_date: nextWeek, due_lesson_id: nil, done: false),
                    Homework(id: "h4", text: "Прочитать конспект лекции", title: "Высшая математика", due_date: today, due_lesson_id: "a", done: true)
                ], generated_at: nil)
            if ProcessInfo.processInfo.arguments.contains("--audit-fixtures") {
                let past = Dates.key(Dates.calendar.date(byAdding: .day, value: -7, to: Date())!)
                snapshot.lessons.append(Lesson(id: "past", date: past, start: "12:00", end: "13:35", title: "Прошедшая практика", type: "practice", room: "1-101"))
                snapshot.lessons.append(Lesson(id: "next-math", date: tomorrow, start: "10:15", end: "11:50", title: "Высшая математика", type: "practice", room: "8-402"))
            }
        } else if let bytes = try? Data(contentsOf: cache), let saved = try? JSONDecoder().decode(Snapshot.self, from: bytes) { snapshot = saved }
    }
    private func request(_ path: String, body: [String: Any]? = nil) async throws -> Data {
        var r = URLRequest(url: base.appendingPathComponent(path)); r.timeoutInterval = 25
        if let body { r.httpMethod = "POST"; r.setValue("application/json", forHTTPHeaderField: "Content-Type"); r.setValue(base.absoluteString, forHTTPHeaderField: "Origin"); r.httpBody = try JSONSerialization.data(withJSONObject: body) }
        let (data, response) = try await session.data(for: r)
        guard let response = response as? HTTPURLResponse else { throw URLError(.badServerResponse) }
        if response.statusCode == 401 { needsLogin = true }
        guard (200..<300).contains(response.statusCode) else {
            let message = (try? JSONSerialization.jsonObject(with: data) as? [String: String])?["error"]
            throw NSError(domain: "MyPairs", code: response.statusCode, userInfo: [NSLocalizedDescriptionKey: message ?? "Не удалось загрузить данные"])
        }
        return data
    }
    func refresh() async {
        guard !demo, !signingIn else { return }
        if let refreshTask { await refreshTask.value; return }
        let task = Task { @MainActor in await self.loadSnapshot() }
        refreshTask = task
        await task.value
        refreshTask = nil
    }
    private func loadSnapshot() async {
        loading = true
        defer { loading = false }
        // Finish already queued writes before reading the server. A revision
        // protects against a new write starting while this GET is in flight.
        let revision = homeworkRevision
        await mutationTail?.value
        do {
            let bytes = try await request("api/app")
            var received = try JSONDecoder().decode(Snapshot.self, from: bytes)
            if homeworkRevision != revision { received.homework = snapshot.homework }
            snapshot = received
            persist()
            needsLogin = false; offline = false; error = nil
        } catch {
            if !needsLogin {
                let code = (error as? URLError)?.code
                offline = code.map { [.notConnectedToInternet, .networkConnectionLost, .cannotConnectToHost, .cannotFindHost, .dnsLookupFailed, .timedOut].contains($0) } ?? false
                self.error = error.localizedDescription
            }
        }
    }
    func login(_ code: String) async throws {
        guard !signingIn else { return }
        signingIn = true
        defer { signingIn = false }
        // Do not join an old unauthenticated refresh after signing in.
        await refreshTask?.value
        _ = try await request("api/login", body: ["code": code.trimmingCharacters(in: .whitespacesAndNewlines)])
        needsLogin = false; error = nil
        signingIn = false
        await refresh()
        if needsLogin || error != nil {
            throw NSError(domain: "MyPairs", code: 0, userInfo: [NSLocalizedDescriptionKey: error ?? "Не удалось загрузить данные после входа. Попробуй ещё раз."])
        }
    }
    func mutate(_ body: [String: Any]) async throws {
        homeworkRevision += 1
        let previous = mutationTail
        let task = Task { @MainActor in
            await previous?.value
            try await self.performMutation(body)
        }
        mutationTail = Task { _ = try? await task.value }
        try await task.value
    }
    private func performMutation(_ body: [String: Any]) async throws {
        if demo {
            if body["action"] as? String == "add", let id = body["lesson_id"] as? String,
               let lesson = snapshot.lessons.first(where: { $0.id == id }), let text = body["text"] as? String {
                let due = body["due_date"] as? String ?? lesson.date
                snapshot.homework.append(Homework(id: UUID().uuidString, text: text.trimmingCharacters(in: .whitespacesAndNewlines), title: lesson.title, due_date: due, due_lesson_id: due == lesson.date ? id : nil, done: false))
            } else if body["action"] as? String == "toggle", let id = body["id"] as? String,
                      let done = body["done"] as? Bool, let index = snapshot.homework.firstIndex(where: { $0.id == id }) {
                let h = snapshot.homework[index]
                snapshot.homework[index] = Homework(id: h.id, text: h.text, title: h.title, due_date: h.due_date, due_lesson_id: h.due_lesson_id, done: done)
            }
            return // Preview changes stay in memory and never reach the server.
        }
        struct Result: Decodable { let homework: [Homework] }
        let bytes = try await request("api/app", body: body)
        snapshot.homework = try JSONDecoder().decode(Result.self, from: bytes).homework
        offline = false
        error = nil
        persist()
    }
    private func persist() {
        if let saved = try? JSONEncoder().encode(snapshot) { try? saved.write(to: cache, options: .atomic) }
    }
    func draft(_ text: String) async throws -> HomeworkDraft {
        if demo { throw NSError(domain: "MyPairs", code: 0, userInfo: [NSLocalizedDescriptionKey: "Для ИИ-разбора войди через /web. В предпросмотре показаны примерные данные."]) }
        struct Result: Decodable { let draft: HomeworkDraft }
        return try JSONDecoder().decode(Result.self, from: await request("api/app", body: ["action": "draft", "text": text])).draft
    }
}
