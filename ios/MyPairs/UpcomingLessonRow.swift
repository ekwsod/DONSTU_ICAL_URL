import SwiftUI

struct UpcomingLessonRow: View {
    let lesson: Lesson
    let homework: [Homework]
    let add: () -> Void
    @ScaledMetric private var timeWidth = 52
    var body: some View {
        HStack(alignment: .top, spacing: 16) {
            VStack(alignment: .leading, spacing: 5) {
                Text(lesson.start).font(.subheadline.bold()).monospacedDigit()
                if let end = lesson.end { Text(end).font(.caption).foregroundStyle(.secondary).monospacedDigit() }
            }.frame(width: timeWidth, alignment: .leading)
            VStack(alignment: .leading, spacing: 6) {
                Text(lesson.kind).font(.caption).foregroundStyle(.secondary)
                Text(lesson.title).font(.headline).fixedSize(horizontal: false, vertical: true)
                Text(lesson.room ?? "Аудитория не указана").font(.subheadline).foregroundStyle(.secondary)
                ForEach(homework) { item in Label(item.text, systemImage: "checklist").font(.subheadline).foregroundStyle(.primary) }
            }
            Spacer(minLength: 0)
        }.padding(.vertical, 14).frame(maxWidth: .infinity, alignment: .leading)
            .contextMenu { Button("Записать дз", systemImage: "plus", action: add) }
    }
}
