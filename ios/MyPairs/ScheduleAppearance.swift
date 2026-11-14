import SwiftUI

enum ScheduleAppearance {
    static let cardRadius: CGFloat = 14
    static let cardInset: CGFloat = 16
    static let cardGap: CGFloat = 8
    static func secondary(_ scheme: ColorScheme) -> Color {
        scheme == .dark ? Color(red: 0.66, green: 0.69, blue: 0.73) : Color(red: 0.38, green: 0.42, blue: 0.46)
    }
    static func background(_ scheme: ColorScheme) -> Color {
        scheme == .dark ? Color(red: 0.063, green: 0.078, blue: 0.086) : Color(red: 0.95, green: 0.96, blue: 0.97)
    }
    static func card(_ scheme: ColorScheme) -> Color {
        scheme == .dark ? Color(red: 0.098, green: 0.114, blue: 0.125) : .white
    }
    static func ink(for type: String, scheme: ColorScheme) -> Color {
        switch type {
        case "lab": return scheme == .dark ? Color(red: 0.81, green: 0.56, blue: 0.91) : Color(red: 0.49, green: 0.19, blue: 0.59)
        case "lecture": return scheme == .dark ? Color(red: 0.56, green: 0.81, blue: 0.50) : Color(red: 0.18, green: 0.41, blue: 0.13)
        case "practice": return scheme == .dark ? Color(red: 0.94, green: 0.75, blue: 0.38) : Color(red: 0.51, green: 0.33, blue: 0.02)
        default: return .secondary
        }
    }
    static func marker(for type: String) -> Color {
        switch type {
        case "lab": return Color(red: 0.65, green: 0.28, blue: 0.75)
        case "lecture": return Color(red: 0.29, green: 0.60, blue: 0.23)
        case "practice": return Color(red: 0.89, green: 0.65, blue: 0.18)
        default: return .secondary
        }
    }
}
