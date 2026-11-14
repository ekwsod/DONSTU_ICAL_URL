import SwiftUI
import UIKit

struct ScheduleSystemDatePicker: UIViewRepresentable {
    @Environment(\.colorScheme) private var scheme
    @Environment(\.displayScale) private var displayScale
    @AppStorage(AppPreferences.lessonDotsKey, store: AppPreferences.store) private var lessonDots = true
    @ScaledMetric(relativeTo: .body) private var dayWidth = 44
    @ScaledMetric(relativeTo: .caption) private var weekdaySize = 12
    @ScaledMetric(relativeTo: .body) private var daySize = 18
    @ScaledMetric(relativeTo: .title2) private var dateLineHeight = 28
    let week: [Date]
    let selected: Date
    let lessons: [Lesson]
    let select: (Date) -> Void

    private var height: CGFloat { dateLineHeight + weekdaySize * 1.2 + 22 }

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    func makeUIView(context: Context) -> ScheduleSegmentedControl {
        let control = ScheduleSegmentedControl(frame: .zero)
        control.apportionsSegmentWidthsByContent = false
        control.clipsToBounds = false
        control.layer.masksToBounds = false
        control.setContentHuggingPriority(.defaultLow, for: .horizontal)
        control.accessibilityIdentifier = "schedule-native-week"
        return control
    }

    func updateUIView(_ control: ScheduleSegmentedControl, context: Context) {
        context.coordinator.parent = self
        let counts = week.map { date in Set(lessons.filter { $0.date == Dates.key(date) }.map(\.start)).count }
        let signature = week.map(Dates.key).joined(separator: ",") + "\(counts)-\(lessonDots)-\(scheme)-\(weekdaySize)-\(daySize)-\(displayScale)"
        control.overrideUserInterfaceStyle = scheme == .dark ? .dark : .light
        control.tintColor = .label
        if signature != context.coordinator.signature && !control.isTracking {
            control.removeAllSegments()
            for (index, date) in week.enumerated() {
                let renderer = ImageRenderer(content: dateLabel(date, count: counts[index]))
                renderer.scale = displayScale
                let image = renderer.uiImage?.withRenderingMode(.alwaysOriginal)
                image?.accessibilityLabel = Dates.title(Dates.key(date))
                image?.accessibilityIdentifier = "schedule-day-\(Dates.key(date))"
                let action = UIAction(title: Dates.title(Dates.key(date)), image: image, identifier: UIAction.Identifier("schedule-day-\(Dates.key(date))")) { [weak coordinator = context.coordinator] _ in
                    guard let parent = coordinator?.parent, parent.week.indices.contains(index) else { return }
                    parent.select(parent.week[index])
                }
                action.accessibilityIdentifier = "schedule-day-\(Dates.key(date))"
                control.insertSegment(action: action, at: index, animated: false)
            }
            control.dateIdentifiers = week.map { "schedule-day-\(Dates.key($0))" }
            control.dateLabels = week.map { Dates.title(Dates.key($0)) }
            control.dateValues = counts.map { "\($0) занятий" }
            context.coordinator.signature = signature
        }
        let index = week.firstIndex { Dates.key($0) == Dates.key(selected) } ?? UISegmentedControl.noSegment
        if !control.isTracking && control.selectedSegmentIndex != index {
            if context.transaction.disablesAnimations {
                UIView.performWithoutAnimation { control.selectedSegmentIndex = index }
            } else {
                control.selectedSegmentIndex = index
            }
        }
        control.setNeedsLayout()
    }

    func sizeThatFits(_ proposal: ProposedViewSize, uiView: ScheduleSegmentedControl, context: Context) -> CGSize? {
        CGSize(width: max(proposal.width ?? 0, dayWidth * CGFloat(week.count)), height: height)
    }

    private func dateLabel(_ date: Date, count: Int) -> some View {
        VStack(spacing: 3) {
            Text(date, format: .dateTime.weekday(.abbreviated)).font(.system(size: weekdaySize))
            Text(date, format: .dateTime.day()).font(.system(size: daySize, weight: .semibold))
                .monospacedDigit().frame(height: dateLineHeight)
            HStack(spacing: count > 5 ? 1 : 3) {
                if count > 8 {
                    Text("\(count)").font(.system(size: 10, weight: .medium))
                } else {
                    ForEach(0..<count, id: \.self) { _ in Circle().frame(width: 3, height: 3) }
                }
            }.frame(height: 4).opacity(lessonDots ? 1 : 0)
        }
        .foregroundStyle(Color.primary).frame(width: dayWidth - 12)
        .environment(\.colorScheme, scheme)
        .environment(\.locale, Locale(identifier: "ru_RU"))
        .environment(\.calendar, Dates.calendar).environment(\.timeZone, Dates.calendar.timeZone)
    }

    final class Coordinator {
        var parent: ScheduleSystemDatePicker
        var signature = ""
        init(_ parent: ScheduleSystemDatePicker) { self.parent = parent }
    }
}
