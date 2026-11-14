import Foundation

struct TodayPlan {
    enum Phase { case current, upcoming, gap, finished, empty }
    let lessons: [Lesson]
    let featured: Lesson?
    let remaining: [Lesson]
    let phase: Phase
    let minutesLeft: Int?
    let progress: Double?

    init(lessons: [Lesson], now: Date) {
        let key = Dates.key(now)
        self.lessons = lessons.filter { $0.date == key }.sorted { $0.start < $1.start }
        let c = Dates.calendar.dateComponents([.hour, .minute], from: now)
        let minutes = (c.hour ?? 0) * 60 + (c.minute ?? 0)
        if let current = self.lessons.first(where: { l in
            guard let end = l.end else { return false }
            return Dates.minutes(l.start) <= minutes && minutes < Dates.minutes(end)
        }) {
            featured = current; phase = .current
            let start = Dates.minutes(current.start), end = Dates.minutes(current.end!)
            minutesLeft = end - minutes
            progress = min(1, max(0, Double(minutes - start) / Double(max(1, end - start))))
            remaining = self.lessons.filter { $0.id != current.id && $0.start >= current.start }
        } else if let next = self.lessons.first(where: { Dates.minutes($0.start) >= minutes }) {
            featured = next
            let previous = self.lessons.last { $0.start < next.start }
            phase = previous?.end.map { Dates.minutes(next.start) - Dates.minutes($0) > 45 } == true ? .gap : .upcoming
            minutesLeft = Dates.minutes(next.start) - minutes; progress = nil
            remaining = self.lessons.filter { $0.id != next.id && $0.start >= next.start }
        } else {
            featured = nil; remaining = []; minutesLeft = nil; progress = nil
            phase = self.lessons.isEmpty ? .empty : .finished
        }
    }
}
