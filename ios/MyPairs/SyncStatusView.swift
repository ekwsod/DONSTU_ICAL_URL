import SwiftUI

struct SyncStatusView: View {
    @Environment(AppModel.self) private var model
    var body: some View {
        if model.offline {
            Label(model.snapshot.lessons.isEmpty && model.snapshot.homework.isEmpty ? "Нет связи · данные ещё не загружены" : "Нет связи · показаны сохранённые данные", systemImage: "wifi.slash")
                .font(.footnote).foregroundStyle(.secondary)
        } else if let error = model.error {
            Label(error, systemImage: "exclamationmark.circle").font(.footnote).foregroundStyle(.secondary)
        }
    }
}
