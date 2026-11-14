import SwiftUI

struct ScheduleDateBarMaterial: ViewModifier {
    @Environment(\.colorScheme) private var scheme
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency

    @ViewBuilder
    func body(content: Content) -> some View {
        if reduceTransparency {
            content.background(ScheduleAppearance.card(scheme), in: .capsule)
        } else if #available(iOS 26.0, *) {
            content.background { Color.clear.glassEffect(.regular, in: .capsule) }
        } else {
            content.background(.regularMaterial, in: .capsule)
        }
    }
}
