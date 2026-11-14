import SwiftUI

enum AppAccent: String, CaseIterable, Identifiable {
    case graphite, blue, green, amber, coral

    var id: Self { self }

    var title: String {
        switch self {
        case .graphite: return "Графитовый"
        case .blue: return "Синий"
        case .green: return "Зелёный"
        case .amber: return "Янтарный"
        case .coral: return "Коралловый"
        }
    }

    /// A stable swatch and switch track, dark enough to keep a white switch thumb visible.
    var swatch: Color {
        switch self {
        case .graphite: return .gray
        case .blue: return Color(red: 0.18, green: 0.43, blue: 0.72)
        case .green: return Color(red: 0.17, green: 0.46, blue: 0.31)
        case .amber: return Color(red: 0.64, green: 0.42, blue: 0.08)
        case .coral: return Color(red: 0.70, green: 0.29, blue: 0.24)
        }
    }

    func tint(for scheme: ColorScheme) -> Color {
        switch self {
        case .graphite: return .primary
        case .blue: return scheme == .dark ? Color(red: 0.50, green: 0.70, blue: 0.94) : Color(red: 0.12, green: 0.36, blue: 0.64)
        case .green: return scheme == .dark ? Color(red: 0.50, green: 0.77, blue: 0.61) : Color(red: 0.15, green: 0.40, blue: 0.28)
        case .amber: return scheme == .dark ? Color(red: 0.94, green: 0.75, blue: 0.38) : Color(red: 0.51, green: 0.33, blue: 0.02)
        case .coral: return scheme == .dark ? Color(red: 0.94, green: 0.59, blue: 0.52) : Color(red: 0.64, green: 0.24, blue: 0.20)
        }
    }

    var heroBackground: Color {
        switch self {
        case .graphite: return Color(red: 0.16, green: 0.18, blue: 0.20)
        case .blue: return Color(red: 0.125, green: 0.306, blue: 0.494)
        case .green: return Color(red: 0.137, green: 0.290, blue: 0.227)
        case .amber: return Color(red: 0.392, green: 0.278, blue: 0.094)
        case .coral: return Color(red: 0.439, green: 0.235, blue: 0.212)
        }
    }
}
