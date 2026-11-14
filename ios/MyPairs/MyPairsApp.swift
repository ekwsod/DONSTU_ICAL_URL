import SwiftUI

@main struct MyPairsApp: App {
    @State private var model = AppModel()
    @AppStorage(AppPreferences.themeKey, store: AppPreferences.store) private var theme: AppTheme = .system
    @AppStorage(AppPreferences.animationsKey, store: AppPreferences.store) private var animations = true
    var body: some Scene {
        WindowGroup {
            RootView().environment(model).environment(\.locale, Locale(identifier: "ru_RU"))
                .environment(\.calendar, Dates.calendar).environment(\.timeZone, Dates.calendar.timeZone)
                .modifier(AccentTint())
                .preferredColorScheme(previewScheme ?? theme.colorScheme)
                .transaction { transaction in
                    if !animations {
                        transaction.animation = nil
                        transaction.disablesAnimations = true
                    }
                }
        }
    }
    private var previewScheme: ColorScheme? {
        let arguments = ProcessInfo.processInfo.arguments
        guard arguments.contains("--demo") else { return nil }
        if arguments.contains("--preview-dark") { return .dark }
        if arguments.contains("--preview-light") { return .light }
        return nil
    }
}

struct RootView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.scenePhase) private var phase
    private enum Screen { case today, schedule, homework }
    @State private var screen: Screen = ProcessInfo.processInfo.arguments.contains("--show-homework") ? .homework : ProcessInfo.processInfo.arguments.contains("--show-schedule") ? .schedule : .today
    var body: some View {
        TabView(selection: $screen) {
            TodayView { screen = .schedule }.tabItem { Label("Сегодня", systemImage: "clock") }.tag(Screen.today)
            ScheduleView().tabItem { Label("Расписание", systemImage: "calendar") }.tag(Screen.schedule)
            HomeworkView().tabItem { Label("Задания", systemImage: "checklist") }.tag(Screen.homework)
        }
        .task { await model.refresh() }
        .onChange(of: phase) { _, value in if value == .active { Task { await model.refresh() } } }
        .sheet(isPresented: Binding(get: { model.needsLogin }, set: { _ in })) { LoginView().interactiveDismissDisabled() }
    }
}

struct TaskRow: View {
    @Environment(AppModel.self) private var model
    @MotionPreference private var reduceMotion
    let item: Homework
    @State private var busy = false
    @State private var error: String?
    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Button {
                busy = true
                Task { defer { busy = false }; do { try await model.mutate(["action": "toggle", "id": item.id, "done": !item.done]) } catch { self.error = error.localizedDescription } }
            } label: {
                ZStack {
                    Image(systemName: item.done ? "checkmark.circle.fill" : "circle").font(.title2)
                        .contentTransition(reduceMotion ? .opacity : .symbolEffect(.replace))
                        .animation(reduceMotion ? nil : .easeOut(duration: 0.18), value: item.done)
                        .opacity(busy ? 0 : 1)
                    if busy { ProgressView() }
                }.frame(width: 44, height: 44)
            }
                .buttonStyle(QuietPressStyle()).foregroundStyle(.tint).disabled(busy).accessibilityLabel(item.done ? "Вернуть в задания" : "Отметить выполненным")
            VStack(alignment: .leading, spacing: 6) {
                Text(item.title).font(.caption).foregroundStyle(.secondary)
                Text(item.text).strikethrough(item.done).foregroundStyle(item.done ? .secondary : .primary)
                Text("К " + Dates.title(item.due_date)).font(.caption).foregroundStyle(.secondary)
            }.padding(.vertical, 5)
        }.alert("Не удалось сохранить", isPresented: Binding(get: { error != nil }, set: { if !$0 { error = nil } })) { Button("ОК") { error = nil } } message: { Text(error ?? "") }
    }
}

struct LoginView: View {
    @Environment(AppModel.self) private var model
    @State private var code = ""
    @State private var busy = false
    @State private var error: String?
    var body: some View {
        NavigationStack {
            Form {
                Section { Label("Расписание и задания рядом", systemImage: "calendar.badge.checkmark").font(.title2).padding(.vertical, 16) }
                Section { Text("Отправь /web своему боту в Telegram и вставь код. Данные синхронизируются с ботом и сайтом.") }
                Section("Код из бота") { TextField("Вставить код", text: $code).textInputAutocapitalization(.never).autocorrectionDisabled().privacySensitive() }
                if let error { Text(error).foregroundStyle(.red) }
                Section { Button { busy = true; Task { defer { busy = false }; do { try await model.login(code) } catch { self.error = error.localizedDescription } } } label: { HStack { Spacer(); if busy { ProgressView() } else { Text("Войти").fontWeight(.semibold) }; Spacer() } }.disabled(busy || code.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty) }
            }.navigationTitle("Мои пары")
        }
    }
}
