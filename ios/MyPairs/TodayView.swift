import SwiftUI

struct TodayView: View {
    @Environment(AppModel.self) private var model
    @MotionPreference private var reduceMotion
    @State private var editor: HomeworkEditorRequest?
    @State private var showingPass = false
    let showSchedule: () -> Void

    private func displayDate(_ now: Date) -> Date {
        model.demo ? Dates.calendar.date(bySettingHour: 9, minute: 41, second: 0, of: now) ?? now : now
    }

    var body: some View {
        NavigationStack {
            TimelineView(.periodic(from: .now, by: 30)) { context in
                let now = displayDate(context.date)
                let plan = TodayPlan(lessons: model.snapshot.lessons, now: now)
                ScrollView {
                    VStack(alignment: .leading, spacing: 24) {
                        Text(Dates.title(Dates.key(now))).font(.subheadline).foregroundStyle(.secondary)
                        if model.demo { Label("Пример данных · время 09:41", systemImage: "eye").font(.caption).foregroundStyle(.secondary) }
                        SyncStatusView()
                        if model.loading && model.snapshot.lessons.isEmpty {
                            ProgressView("Загружаем расписание")
                        } else if model.error != nil && model.snapshot.lessons.isEmpty {
                            ContentUnavailableView("Расписание не загружено", systemImage: "calendar", description: Text("Потяни экран вниз, чтобы попробовать ещё раз"))
                        } else { TodayHero(plan: plan) }
                        if let current = plan.featured, plan.phase == .current {
                            let due = model.snapshot.homework.filter { !$0.done && $0.due_lesson_id == current.id }
                            ForEach(due) { item in TaskRow(item: item).transition(.opacity) }
                        }
                        HStack {
                            Text("Дальше по плану").font(.headline)
                            Spacer()
                            Button("Расписание", action: showSchedule).font(.subheadline).frame(minHeight: 44)
                        }
                        if plan.remaining.isEmpty && !model.loading && model.error == nil {
                            Text(plan.phase == .current ? "Это последняя пара на сегодня." : "Других пар на сегодня нет.").font(.subheadline).foregroundStyle(.secondary)
                        }
                        VStack(spacing: 0) {
                            ForEach(Array(plan.remaining.enumerated()), id: \.element.id) { index, lesson in
                                let prev = index == 0 ? plan.featured : plan.remaining[index - 1]
                                if let end = prev?.end, Dates.minutes(lesson.start) - Dates.minutes(end) > 45 {
                                    Label("Окно \(end)–\(lesson.start)", systemImage: "cup.and.saucer").font(.footnote).foregroundStyle(.secondary).frame(maxWidth: .infinity, alignment: .leading).padding(.vertical, 12)
                                }
                                UpcomingLessonRow(lesson: lesson, homework: model.snapshot.homework.filter { !$0.done && $0.due_lesson_id == lesson.id }) { editor = HomeworkEditorRequest(lesson: lesson) }
                                if index < plan.remaining.count - 1 { Divider() }
                            }
                        }
                        let loose = model.snapshot.homework.filter { !$0.done && $0.due_date == Dates.key(now) }.filter { item in !plan.lessons.contains { $0.id == item.due_lesson_id } }
                        if !loose.isEmpty {
                            Text("Задания на сегодня").font(.headline)
                            ForEach(loose) { item in TaskRow(item: item).transition(.opacity) }
                        }
                    }.padding(.horizontal, 24).padding(.top, 8).padding(.bottom, 24)
                        .animation(InterfaceMotion.list(reduceMotion: reduceMotion), value: model.snapshot.homework.filter { !$0.done }.map(\.id))
                }.refreshable { await model.refresh() }
            }.navigationTitle("Сегодня").navigationBarTitleDisplayMode(.large)
                .toolbar {
                    ToolbarItem(placement: .topBarLeading) {
                        Button("Пропуск", systemImage: "qrcode") { showingPass = true }
                    }
                    ToolbarItem(placement: .topBarTrailing) {
                        Button("Новое задание", systemImage: "plus") { editor = HomeworkEditorRequest() }
                    }
                }
                .sheet(item: $editor) { request in AddHomeworkView(initial: request.lesson) }
                .sheet(isPresented: $showingPass) { CampusPassView() }
                .task { if model.demo && ProcessInfo.processInfo.arguments.contains("--show-add") { editor = HomeworkEditorRequest() } }
        }
    }
}
