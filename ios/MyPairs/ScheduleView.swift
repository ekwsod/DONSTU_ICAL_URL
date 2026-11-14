import SwiftUI

struct ScheduleView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.colorScheme) private var scheme
    @MotionPreference private var reduceMotion
    @AppStorage(AppPreferences.animationsKey, store: AppPreferences.store) private var animations = true
    @ScaledMetric(relativeTo: .title3) private var headerSize = 20
    @ScaledMetric(relativeTo: .caption) private var smallSize = 12
    @State private var selected = Date()
    @State private var calendarOpen = false
    @State private var settingsOpen = false
    @State private var editor: HomeworkEditorRequest?

    private var day: [Lesson] {
        model.snapshot.lessons.filter { $0.date == Dates.key(selected) }.sorted { $0.start < $1.start }
    }
    private var week: [Date] {
        let start = Dates.calendar.dateInterval(of: .weekOfYear, for: selected)?.start ?? selected
        return (0..<6).compactMap { Dates.calendar.date(byAdding: .day, value: $0, to: start) }
    }
    private var looseTasks: [Homework] {
        model.snapshot.homework.filter { task in
            !task.done && task.due_date == Dates.key(selected) && !day.contains { $0.id == task.due_lesson_id }
        }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    calendar
                    if model.demo { Label("Пример данных", systemImage: "eye").font(.caption).foregroundStyle(.secondary) }
                    SyncStatusView()
                    dayContent
                        .id(Dates.key(selected))
                        .transition(.opacity)
                }.padding(.horizontal, 16).padding(.top, 8).padding(.bottom, 32)
            }
            .background(ScheduleAppearance.background(scheme))
            .refreshable { await model.refresh() }
            .navigationTitle("Расписание")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar(.hidden, for: .navigationBar)
            .sheet(isPresented: $calendarOpen) {
                NavigationStack {
                    DatePicker("Дата", selection: $selected, displayedComponents: .date)
                        .datePickerStyle(.graphical).padding()
                        .navigationTitle("Выбрать дату").navigationBarTitleDisplayMode(.inline)
                        .toolbar { Button("Готово") { calendarOpen = false } }
                }.presentationDetents([.medium, .large])
            }
            .sheet(item: $editor) { request in AddHomeworkView(initial: request.lesson) }
            .sheet(isPresented: $settingsOpen) { SettingsView() }
            .task {
                if model.demo && ProcessInfo.processInfo.arguments.contains("--show-add") { editor = HomeworkEditorRequest() }
                else if model.demo && ProcessInfo.processInfo.arguments.contains("--show-settings") { settingsOpen = true }
            }
        }
    }

    private var dayContent: some View {
        VStack(alignment: .leading, spacing: 20) {
            if day.isEmpty && model.loading {
                ProgressView("Загружаем расписание")
            } else if day.isEmpty && model.error != nil && model.snapshot.lessons.isEmpty {
                ContentUnavailableView("Расписание не загружено", systemImage: "calendar", description: Text("Потяни экран вниз, чтобы попробовать ещё раз"))
            } else if day.isEmpty {
                ContentUnavailableView("День без пар", systemImage: "calendar", description: Text("На выбранную дату в расписании нет занятий"))
            } else {
                VStack(spacing: ScheduleAppearance.cardGap) {
                    ForEach(Array(day.enumerated()), id: \.element.id) { index, lesson in
                        if index > 0 {
                            if let end = day[index - 1].end, Dates.minutes(lesson.start) - Dates.minutes(end) > 45 {
                                Text("Окно \(end)–\(lesson.start)")
                                    .font(.footnote).foregroundStyle(ScheduleAppearance.secondary(scheme)).monospacedDigit()
                                    .frame(maxWidth: .infinity, alignment: .leading).padding(.vertical, 8).padding(.horizontal, 20)
                            }
                        }
                        ScheduleLessonRow(lesson: lesson, homework: model.snapshot.homework.filter { !$0.done && $0.due_lesson_id == lesson.id }, position: (Array(Set(day.map(\.start))).sorted().firstIndex(of: lesson.start) ?? index) + 1) {
                            editor = HomeworkEditorRequest(lesson: lesson)
                        }
                    }
                }
            }
            if !looseTasks.isEmpty {
                VStack(alignment: .leading, spacing: 12) {
                    Text("Задания на день").font(.headline)
                    ForEach(looseTasks) { task in HomeworkListRow(item: task) }
                }
            }
        }
    }

    private var calendar: some View {
        VStack(spacing: 12) {
            ViewThatFits(in: .horizontal) {
                HStack(spacing: 8) {
                    headerTitle
                    Spacer(minLength: 12)
                    headerControls
                }
                VStack(alignment: .leading, spacing: 8) {
                    headerTitle
                    HStack { Spacer(minLength: 0); headerControls }
                }
            }
            HStack(spacing: 0) {
                Button { moveWeek(-1) } label: {
                    Image(systemName: "chevron.left").font(.body.weight(.medium)).foregroundStyle(.tint)
                        .frame(width: 44, height: 64).contentShape(.rect)
                }.buttonStyle(QuietPressStyle()).accessibilityLabel("Предыдущая неделя")
                ViewThatFits(in: .horizontal) {
                    weekStrip()
                    ScrollViewReader { proxy in
                        ScrollView(.horizontal) { weekStrip(scrubbing: false) }.scrollIndicators(.hidden)
                            .onAppear { proxy.scrollTo(Dates.key(selected), anchor: .center) }
                            .onChange(of: selected) { _, date in proxy.scrollTo(Dates.key(date), anchor: .center) }
                    }
                }
                Button { moveWeek(1) } label: {
                    Image(systemName: "chevron.right").font(.body.weight(.medium)).foregroundStyle(.tint)
                        .frame(width: 44, height: 64).contentShape(.rect)
                }.buttonStyle(QuietPressStyle()).accessibilityLabel("Следующая неделя")
            }
            .foregroundStyle(ScheduleAppearance.secondary(scheme))
            .padding(4)
            .modifier(ScheduleDateBarMaterial())
            .padding(.horizontal, -8)
        }
    }

    private var headerTitle: some View {
        Text("Расписание").font(.system(size: headerSize, weight: .medium))
            .fixedSize(horizontal: true, vertical: false).accessibilityAddTraits(.isHeader)
    }

    private var headerControls: some View {
        HStack(spacing: 4) {
            Button { calendarOpen = true } label: {
                HStack(spacing: 8) {
                    Image(systemName: "calendar").font(.system(size: 18)).foregroundStyle(.tint).accessibilityHidden(true)
                    VStack(alignment: .leading, spacing: 0) {
                        if let first = week.first, let last = week.last {
                            Text(first, format: .dateTime.day().month(.abbreviated))
                            Text(last, format: .dateTime.day().month(.abbreviated))
                        }
                    }.font(.system(size: smallSize)).monospacedDigit()
                }.fixedSize(horizontal: true, vertical: false).frame(minHeight: 44)
            }.buttonStyle(QuietPressStyle()).accessibilityLabel("Выбрать месяц и дату")
            Menu {
                Button("Сегодня", systemImage: "arrow.uturn.backward") { select(Date()) }
                    .accessibilityIdentifier("schedule-today")
                Button("Новое задание", systemImage: "plus") { editor = HomeworkEditorRequest() }
                Button("Настройки", systemImage: "gearshape") { settingsOpen = true }
                    .accessibilityIdentifier("schedule-settings")
            } label: {
                Image(systemName: "ellipsis").font(.system(size: 18, weight: .medium)).foregroundStyle(.tint).frame(width: 44, height: 44)
            }.accessibilityLabel("Действия расписания").accessibilityIdentifier("schedule-actions")
        }.foregroundStyle(ScheduleAppearance.secondary(scheme))
    }

    private func weekStrip(scrubbing: Bool = true) -> some View {
        Group {
            if #available(iOS 26.0, *), scrubbing {
                ScheduleSystemDatePicker(week: week, selected: selected, lessons: model.snapshot.lessons, select: select)
            } else {
                ScheduleWeekStrip(week: week, selected: selected, lessons: model.snapshot.lessons, scrubbing: scrubbing, select: select)
            }
        }.id(week.first)
    }

    private func select(_ date: Date) {
        guard Dates.key(date) != Dates.key(selected) else { return }
        withAnimation(animations ? InterfaceMotion.selection(reduceMotion: reduceMotion) : nil) { selected = date }
    }

    private func moveWeek(_ offset: Int) {
        if let date = Dates.calendar.date(byAdding: .day, value: offset * 7, to: selected) { select(date) }
    }
}
