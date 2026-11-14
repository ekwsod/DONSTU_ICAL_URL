import SwiftUI

struct TodayHero: View {
    @AppStorage(AppPreferences.accentKey, store: AppPreferences.store) private var accent: AppAccent = .graphite
    let plan: TodayPlan
    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            if let lesson = plan.featured {
                Label(plan.phase == .current ? "Сейчас · \(lesson.kind.lowercased())" : plan.phase == .gap ? "Окно между парами" : "Следующая · \(lesson.kind.lowercased())", systemImage: plan.phase == .gap ? "cup.and.saucer" : lesson.symbol)
                    .font(.subheadline)
                Text(lesson.title).font(.title2.bold()).fixedSize(horizontal: false, vertical: true)
                Label(lesson.room ?? "Аудитория не указана", systemImage: "mappin.and.ellipse").font(.subheadline)
                if let progress = plan.progress {
                    ProgressView(value: progress).tint(.white)
                        .accessibilityLabel("Прошедшая часть пары")
                    Text("До конца \(plan.minutesLeft ?? 0) мин · до \(lesson.end ?? lesson.start)").font(.footnote)
                } else {
                    Text("Начало в \(lesson.start) · через \(plan.minutesLeft ?? 0) мин").font(.footnote)
                }
            } else {
                Image(systemName: plan.phase == .empty ? "sun.max" : "checkmark.seal").font(.title)
                Text(plan.phase == .empty ? "День без пар" : "На сегодня всё").font(.title2.bold())
                Text(plan.phase == .empty ? "На сегодня в загруженном расписании нет занятий." : "Все сегодняшние занятия по расписанию закончились.").font(.subheadline)
            }
        }.frame(maxWidth: .infinity, alignment: .leading)
            .padding(24).foregroundStyle(.white)
            .background(accent.heroBackground, in: RoundedRectangle(cornerRadius: 26))
    }
}
