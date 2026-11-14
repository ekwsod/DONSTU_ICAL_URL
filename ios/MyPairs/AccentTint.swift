import SwiftUI

struct AccentTint: ViewModifier {
    @Environment(\.colorScheme) private var scheme
    @AppStorage(AppPreferences.accentKey, store: AppPreferences.store) private var accent: AppAccent = .graphite

    func body(content: Content) -> some View {
        content.tint(accent.tint(for: scheme))
    }
}
