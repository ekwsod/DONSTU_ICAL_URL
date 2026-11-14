import SwiftUI

struct HomeworkListRow: View {
    @Environment(AppModel.self) private var model
    @Environment(\.colorScheme) private var scheme
    @MotionPreference private var reduceMotion
    let item: Homework
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Button {
                busy = true
                Task {
                    defer { busy = false }
                    do { try await model.mutate(["action": "toggle", "id": item.id, "done": !item.done]) }
                    catch { self.error = error.localizedDescription }
                }
            } label: {
                ZStack {
                    Image(systemName: item.done ? "checkmark.circle.fill" : "circle")
                        .font(.title2.weight(.light))
                        .contentTransition(reduceMotion ? .opacity : .symbolEffect(.replace))
                        .animation(.easeOut(duration: 0.18), value: item.done)
                        .opacity(busy ? 0 : 1)
                    if busy { ProgressView() }
                }.frame(width: 44, height: 44)
            }
            .buttonStyle(QuietPressStyle()).foregroundStyle(ScheduleAppearance.secondary(scheme)).disabled(busy)
            .accessibilityLabel(item.done ? "Вернуть в задания" : "Отметить выполненным")
            .accessibilityValue(item.text)
            VStack(alignment: .leading, spacing: 6) {
                Text(item.text).font(.body).strikethrough(item.done)
                    .foregroundStyle(item.done ? ScheduleAppearance.secondary(scheme) : Color.primary).fixedSize(horizontal: false, vertical: true)
                Text(item.title).font(.subheadline).foregroundStyle(ScheduleAppearance.secondary(scheme)).fixedSize(horizontal: false, vertical: true)
            }.padding(.vertical, 8)
        }.frame(maxWidth: .infinity, alignment: .leading)
            .alert("Не удалось сохранить", isPresented: Binding(get: { error != nil }, set: { if !$0 { error = nil } })) {
                Button("ОК") { error = nil }
            } message: { Text(error ?? "") }
    }
}
