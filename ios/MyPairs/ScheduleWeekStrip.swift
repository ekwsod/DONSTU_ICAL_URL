import SwiftUI

struct ScheduleWeekStrip: View {
    @MotionPreference private var reduceMotion
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
    @AppStorage(AppPreferences.lessonDotsKey, store: AppPreferences.store) private var lessonDots = true
    @ScaledMetric(relativeTo: .body) private var dayWidth = 44
    @ScaledMetric(relativeTo: .caption) private var smallSize = 12
    @ScaledMetric(relativeTo: .body) private var dateSize = 18
    @ScaledMetric(relativeTo: .title2) private var selectedDateSize = 22
    @ScaledMetric(relativeTo: .title2) private var dateLineHeight = 28
    @Namespace private var coordinateSpace
    @State private var frames: [String: CGRect] = [:]
    @GestureState private var dragX: CGFloat?
    let week: [Date]
    let selected: Date
    let lessons: [Lesson]
    let scrubbing: Bool
    let select: (Date) -> Void

    private var highlightedKey: String {
        dragX.flatMap(nearestDate).map(Dates.key) ?? Dates.key(selected)
    }

    var body: some View {
        HStack(spacing: 0) {
            ForEach(week, id: \.self) { date in
                dateButton(date)
            }
        }
        .coordinateSpace(name: coordinateSpace)
        .background(alignment: .topLeading) {
            if let frame = frames[highlightedKey] {
                // This lens keeps its identity. Only its frame moves; dates remain fixed above it.
                lens
                    .frame(width: frame.width, height: frame.height)
                    .position(x: dragX ?? frame.midX, y: frame.midY)
                    .allowsHitTesting(false)
                    .animation(reduceMotion ? nil : .smooth(duration: 0.28, extraBounce: 0), value: Dates.key(selected))
                    .animation(reduceMotion ? nil : .smooth(duration: 0.28, extraBounce: 0), value: dragX == nil)
                    .transaction { transaction in if dragX != nil { transaction.animation = nil } }
            }
        }
        .onPreferenceChange(ScheduleDateFrames.self) { frames = $0 }
        .simultaneousGesture(
            DragGesture(minimumDistance: 8)
                .updating($dragX) { value, state, transaction in
                    guard scrubbing, abs(value.translation.width) > abs(value.translation.height),
                          let first = frames.values.map(\.midX).min(), let last = frames.values.map(\.midX).max() else { return }
                    state = min(max(value.location.x, first), last)
                    transaction.animation = nil
                }
                .onEnded { value in
                    guard scrubbing, abs(value.translation.width) > abs(value.translation.height),
                          let date = nearestDate(value.location.x) else { return }
                    select(date)
                }, including: scrubbing ? .all : .none
        )
    }

    private func dateButton(_ date: Date) -> some View {
        let key = Dates.key(date)
        let isSelected = key == Dates.key(selected)
        let isHighlighted = key == highlightedKey
        let isToday = Dates.calendar.isDateInToday(date)
        let count = Set(lessons.filter { $0.date == key }.map(\.start)).count
        return Button { select(date) } label: {
            VStack(spacing: 3) {
                Text(date, format: .dateTime.weekday(.abbreviated))
                    .font(.system(size: smallSize, weight: isHighlighted ? .medium : .regular))
                Text(date, format: .dateTime.day())
                    .font(.system(size: isHighlighted ? selectedDateSize : dateSize, weight: .semibold))
                    .monospacedDigit().frame(height: dateLineHeight)
                HStack(spacing: 3) {
                    ForEach(0..<min(count, 8), id: \.self) { _ in Circle().frame(width: 3, height: 3) }
                    if count > 8 { Text("+\(count - 8)").font(.caption2) }
                }.frame(height: 4).accessibilityHidden(true)
                    .opacity(lessonDots ? (isHighlighted || isToday ? 1 : 0.6) : 0)
            }
            .padding(.vertical, 6).frame(minWidth: dayWidth, maxWidth: .infinity)
            .foregroundStyle(Color.primary).contentShape(.rect)
            .overlay { Capsule().strokeBorder(isToday && !isHighlighted ? Color.primary.opacity(0.2) : .clear, lineWidth: 1) }
        }
        .buttonStyle(QuietPressStyle())
        .background {
            GeometryReader { geometry in
                Color.clear.preference(key: ScheduleDateFrames.self, value: [key: geometry.frame(in: .named(coordinateSpace))])
            }
        }
        .id(key).accessibilityIdentifier("schedule-day-\(key)")
        .accessibilityLabel(Text(date, format: .dateTime.weekday(.wide).day().month(.wide)))
        .accessibilityValue("\(count) занятий")
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }

    private func nearestDate(_ x: CGFloat) -> Date? {
        week.filter { frames[Dates.key($0)] != nil }.min {
            abs((frames[Dates.key($0)]?.midX ?? 0) - x) < abs((frames[Dates.key($1)]?.midX ?? 0) - x)
        }
    }

    @ViewBuilder
    private var lens: some View {
        if reduceTransparency {
            Capsule().fill(Color.primary.opacity(0.12))
        } else if #available(iOS 26.0, *) {
            Color.clear.glassEffect(.regular, in: .capsule)
        } else {
            Capsule().fill(.thinMaterial)
        }
    }
}
