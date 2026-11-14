import Foundation

enum AppPreferences {
    static let themeKey = "appearance.theme"
    static let accentKey = "appearance.accent"
    static let animationsKey = "appearance.animations"
    static let lessonDotsKey = "schedule.lessonDots"

    // Demo preferences are separate from the user's real app settings.
    static let store: UserDefaults = {
        let arguments = ProcessInfo.processInfo.arguments
        let previewDomain = "ru.ekwsod.mypairs.preview"
        guard arguments.contains("--demo"), let preview = UserDefaults(suiteName: previewDomain) else { return .standard }
        if arguments.contains("--reset-preferences") { preview.removePersistentDomain(forName: previewDomain) }
        return preview
    }()
}
