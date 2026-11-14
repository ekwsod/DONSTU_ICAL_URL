import SwiftUI

@propertyWrapper
struct MotionPreference: DynamicProperty {
    @Environment(\.accessibilityReduceMotion) private var systemSetting
    @AppStorage(AppPreferences.animationsKey, store: AppPreferences.store) private var animations = true

    var wrappedValue: Bool {
        let arguments = ProcessInfo.processInfo.arguments
        return !animations || systemSetting || (arguments.contains("--demo") && arguments.contains("--preview-reduced-motion"))
    }
}

enum InterfaceMotion {
    static func selection(reduceMotion: Bool) -> Animation {
        reduceMotion ? .easeOut(duration: 0.12) : .smooth(duration: 0.24, extraBounce: 0)
    }

    static func list(reduceMotion: Bool) -> Animation? {
        reduceMotion ? nil : .easeInOut(duration: 0.22)
    }
}

/// Immediate touch feedback; the action still commits on release and can be cancelled.
struct QuietPressStyle: ButtonStyle {
    @MotionPreference private var reduceMotion

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .opacity(configuration.isPressed ? 0.65 : 1)
            .scaleEffect(configuration.isPressed && !reduceMotion ? 0.96 : 1)
            .animation(reduceMotion ? nil : .easeOut(duration: 0.10), value: configuration.isPressed)
    }
}
