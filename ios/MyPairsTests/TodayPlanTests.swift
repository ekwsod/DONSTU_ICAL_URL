import XCTest
@testable import MyPairs

final class TodayPlanTests: XCTestCase {
    private let lessons = [
        Lesson(id: "a", date: "2026-11-13", start: "08:30", end: "10:05", title: "Математика", type: "lecture", room: nil),
        Lesson(id: "b", date: "2026-11-13", start: "12:00", end: "13:35", title: "Химия", type: "lab", room: nil)
    ]
    private func plan(_ time: String) -> TodayPlan {
        TodayPlan(lessons: lessons, now: ISO8601DateFormatter().date(from: "2026-11-13T\(time):00+03:00")!)
    }
    func testBeforeLessons() {
        XCTAssertEqual(plan("08:00").phase, .upcoming)
        XCTAssertEqual(plan("08:00").minutesLeft, 30)
        XCTAssertEqual(plan("08:00").remaining.map(\.id), ["b"])
    }
    func testCurrentAndProgress() {
        XCTAssertEqual(plan("09:00").phase, .current)
        XCTAssertEqual(plan("09:00").minutesLeft, 65)
        XCTAssertEqual(plan("09:00").progress!, 30.0 / 95, accuracy: 0.001)
    }
    func testEndBoundaryIsGap() {
        XCTAssertEqual(plan("10:05").phase, .gap)
        XCTAssertEqual(plan("10:05").featured?.id, "b")
        XCTAssertEqual(plan("12:00").phase, .current)
    }
    func testFinishedAndEmpty() {
        XCTAssertEqual(plan("13:35").phase, .finished)
        XCTAssertNil(plan("13:35").featured)
        XCTAssertEqual(TodayPlan(lessons: [], now: Date()).phase, .empty)
    }
    func testSimultaneousLessonsAreNotLost() {
        let twin = Lesson(id: "parallel", date: lessons[0].date, start: lessons[0].start, end: lessons[0].end, title: "Другой предмет", type: "practice", room: nil)
        let now = ISO8601DateFormatter().date(from: "2026-11-13T09:00:00+03:00")!
        let plan = TodayPlan(lessons: lessons + [twin], now: now)
        XCTAssertEqual(Set(plan.remaining.map(\.id) + [plan.featured!.id]), Set(["a", "parallel", "b"]))
    }
}
