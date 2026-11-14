import SwiftUI

struct SettingsView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    @Environment(\.colorScheme) private var scheme
    @AppStorage(AppPreferences.themeKey, store: AppPreferences.store) private var theme: AppTheme = .system
    @AppStorage(AppPreferences.animationsKey, store: AppPreferences.store) private var animations = true
    @AppStorage(AppPreferences.lessonDotsKey, store: AppPreferences.store) private var lessonDots = true
    @AppStorage(AppPreferences.accentKey, store: AppPreferences.store) private var accent: AppAccent = .graphite

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Picker("Тема", selection: $theme) {
                        ForEach(AppTheme.allCases) { theme in
                            Text(theme.title).tag(theme)
                                .accessibilityIdentifier("settings-theme-\(theme.rawValue)")
                        }
                    }.pickerStyle(.inline).labelsHidden()
                } header: {
                    Text("Тема")
                } footer: {
                    Text("Системная тема меняется вместе с оформлением iPhone.")
                }

                Section("Оформление") {
                    Picker("Акцентный цвет", selection: $accent) {
                        ForEach(AppAccent.allCases) { color in
                            HStack(spacing: 10) {
                                Circle().fill(color.swatch).frame(width: 16, height: 16).accessibilityHidden(true)
                                Text(color.title)
                            }.tag(color)
                        }
                    }.pickerStyle(.navigationLink)
                        .accessibilityIdentifier("settings-accent")
                }

                Section {
                    Toggle("Анимации", isOn: $animations)
                        .tint(accent.swatch)
                        .accessibilityIdentifier("settings-animations")
                } header: {
                    Text("Движение")
                } footer: {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Плавные переходы при выборе даты и работе с заданиями.")
                        if systemReduceMotion {
                            Text("На iPhone включено «Уменьшение движения». Перемещения заменяются спокойными переходами.")
                        }
                    }
                }

                Section {
                    Toggle("Точки под датами", isOn: $lessonDots)
                        .tint(accent.swatch)
                        .accessibilityIdentifier("settings-lesson-dots")
                } header: {
                    Text("Расписание")
                } footer: {
                    Text("Показывают количество пар на каждый день.")
                }
            }
            .tint(accent.tint(for: scheme))
            .navigationTitle("Настройки")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("Готово") { dismiss() } }
            }
        }
    }
}
