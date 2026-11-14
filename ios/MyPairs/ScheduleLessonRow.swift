import SwiftUI

struct ScheduleLessonRow: View {
    @Environment(\.colorScheme) private var scheme
    @ScaledMetric(relativeTo: .headline) private var titleSize = 17
    @ScaledMetric(relativeTo: .subheadline) private var metadataSize = 14
    @ScaledMetric(relativeTo: .caption) private var badgeSize = 12
    @ScaledMetric(relativeTo: .subheadline) private var iconSize = 16
    @ScaledMetric(relativeTo: .subheadline) private var iconColumn = 18
    @ScaledMetric(relativeTo: .subheadline) private var iconGap = 8
    let lesson: Lesson
    let homework: [Homework]
    var position: Int? = nil
    let add: () -> Void

    private var ink: Color { ScheduleAppearance.ink(for: lesson.type, scheme: scheme) }
    private var badge: String {
        switch lesson.type { case "lab": return "Лаб"; case "lecture": return "Лек"; case "practice": return "Пр"; default: return "Занятие" }
    }

    var body: some View {
        let display = LessonDisplay(lesson.title)
        VStack(alignment: .leading, spacing: 10) {
            ViewThatFits(in: .horizontal) {
                HStack(alignment: .firstTextBaseline, spacing: 12) {
                    time
                    Spacer(minLength: 0)
                    typeBadge
                }
                VStack(alignment: .leading, spacing: 8) { time; typeBadge }
            }
            VStack(alignment: .leading, spacing: 8) {
                Text(display.title).font(.system(size: titleSize, weight: .semibold))
                    .lineSpacing(2).fixedSize(horizontal: false, vertical: true)
                if let detail = display.detail {
                    Text(detail).font(.system(size: metadataSize)).foregroundStyle(ScheduleAppearance.secondary(scheme))
                        .fixedSize(horizontal: false, vertical: true)
                }
                HStack(alignment: .firstTextBaseline, spacing: iconGap) {
                    Image(systemName: "building.2").font(.system(size: iconSize)).frame(width: iconColumn).accessibilityHidden(true)
                    Text(lesson.room ?? "Аудитория не указана").font(.system(size: metadataSize))
                }.foregroundStyle(ScheduleAppearance.secondary(scheme))
                    .fixedSize(horizontal: false, vertical: true)
            }
            ForEach(homework) { item in
                Label(item.text, systemImage: "checklist")
                    .font(.system(size: metadataSize)).fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(ScheduleAppearance.cardInset).padding(.leading, 4)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(ScheduleAppearance.card(scheme))
        .overlay(alignment: .leading) {
            Rectangle().fill(ScheduleAppearance.marker(for: lesson.type)).frame(width: 4).accessibilityHidden(true)
        }
        .clipShape(RoundedRectangle(cornerRadius: ScheduleAppearance.cardRadius))
        .contentShape(.rect)
        .contextMenu { Button("Записать дз", systemImage: "plus", action: add) }
        .accessibilityAction(named: "Записать дз", add)
    }

    private var time: some View {
        HStack(spacing: iconGap) {
            Image(systemName: "clock").font(.system(size: iconSize)).frame(width: iconColumn).accessibilityHidden(true)
            Text(lesson.end.map { "\(lesson.start) – \($0)" } ?? lesson.start).monospacedDigit()
        }.font(.system(size: metadataSize)).foregroundStyle(ScheduleAppearance.secondary(scheme)).fixedSize(horizontal: true, vertical: false)
    }

    private var typeBadge: some View {
        HStack(spacing: 8) {
            if let position { Text("\(position)-я").font(.system(size: badgeSize)).foregroundStyle(ScheduleAppearance.secondary(scheme)) }
            Text(badge).font(.system(size: badgeSize, weight: .medium)).foregroundStyle(ink)
                .padding(.horizontal, 8).padding(.vertical, 4)
                .background(ink.opacity(scheme == .dark ? 0.10 : 0.07), in: RoundedRectangle(cornerRadius: 6))
                .accessibilityLabel(lesson.kind)
        }.fixedSize(horizontal: true, vertical: false)
    }
}
