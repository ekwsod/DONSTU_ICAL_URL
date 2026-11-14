import SwiftUI

struct HomeworkView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.colorScheme) private var scheme
    @MotionPreference private var reduceMotion
    @State private var completed = false
    @State private var adding = false

    private var tasks: [Homework] {
        model.snapshot.homework.filter { completed || !$0.done }.sorted {
            if $0.due_date != $1.due_date { return $0.due_date < $1.due_date }
            if $0.done != $1.done { return !$0.done }
            if $0.title != $1.title { return $0.title < $1.title }
            return $0.id < $1.id
        }
    }
    private var dates: [String] { Array(Set(tasks.map(\.due_date))).sorted() }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    Menu {
                        Picker("Показать задания", selection: $completed) {
                            Text("Невыполненные").tag(false)
                            Text("Все задания").tag(true)
                        }
                    } label: {
                        HStack(spacing: 8) {
                            Text(completed ? "Все задания" : "Невыполненные")
                            Image(systemName: "chevron.down").font(.caption)
                        }.font(.subheadline).foregroundStyle(ScheduleAppearance.secondary(scheme)).frame(minHeight: 44)
                    }.accessibilityIdentifier("homework-filter")
                    if model.demo { Label("Пример данных", systemImage: "eye").font(.caption).foregroundStyle(.secondary) }
                    SyncStatusView()
                    taskSections
                }.padding(.horizontal, 24).padding(.top, 8).padding(.bottom, 32)
            }
            .background(ScheduleAppearance.background(scheme))
            .toolbarBackground(ScheduleAppearance.background(scheme), for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
            .navigationTitle("Задания").navigationBarTitleDisplayMode(.large)
            .refreshable { await model.refresh() }
            .toolbar { Button("Новое задание", systemImage: "plus") { adding = true } }
            .sheet(isPresented: $adding) { AddHomeworkView(initial: nil) }
        }
    }

    private var taskSections: some View {
        VStack(alignment: .leading, spacing: 24) {
            if tasks.isEmpty && model.loading {
                ProgressView("Загружаем задания")
            } else if tasks.isEmpty && model.error != nil {
                ContentUnavailableView("Не удалось обновить задания", systemImage: "checklist", description: Text("Потяни экран вниз, чтобы попробовать ещё раз"))
            } else if tasks.isEmpty {
                ContentUnavailableView(completed ? "Заданий пока нет" : "Всё сделано", systemImage: "checkmark", description: Text("Нажми «+», чтобы записать задание. Записи из бота тоже появятся здесь."))
            }
            ForEach(dates, id: \.self) { date in
                VStack(alignment: .leading, spacing: 8) {
                    ViewThatFits(in: .horizontal) {
                        HStack(alignment: .firstTextBaseline) {
                            Text(heading(date)).font(.headline)
                            Spacer(minLength: 16)
                            dateLabel(date)
                        }
                        VStack(alignment: .leading, spacing: 4) {
                            Text(heading(date)).font(.headline)
                            dateLabel(date)
                        }
                    }
                    Divider()
                    let items = tasks.filter { $0.due_date == date }
                    ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
                        HomeworkListRow(item: item)
                            .transition(.opacity)
                        if index < items.count - 1 { Divider().padding(.leading, 56) }
                    }
                }.transition(.opacity)
            }
        }
        .animation(InterfaceMotion.list(reduceMotion: reduceMotion), value: tasks.map(\.id))
    }

    private func heading(_ key: String) -> String {
        let date = Dates.date(key)
        if Dates.calendar.isDateInToday(date) { return "Сегодня" }
        if Dates.calendar.isDateInTomorrow(date) { return "Завтра" }
        if key < Dates.key(Date()) && tasks.contains(where: { $0.due_date == key && !$0.done }) { return "Просрочено" }
        return date.formatted(.dateTime.weekday(.wide).locale(Locale(identifier: "ru_RU"))).capitalized
    }

    private func dateLabel(_ key: String) -> some View {
        let overdue = key < Dates.key(Date()) && tasks.contains { $0.due_date == key && !$0.done }
        let date = Dates.date(key)
        let sameYear = Dates.calendar.component(.year, from: date) == Dates.calendar.component(.year, from: Date())
        return Text(date, format: sameYear ? .dateTime.day().month(.wide) : .dateTime.day().month(.wide).year())
            .font(.subheadline).foregroundStyle(overdue ? Color.red : ScheduleAppearance.secondary(scheme))
    }
}
