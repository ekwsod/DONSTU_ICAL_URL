import SwiftUI

struct CampusPassView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var phase
    @State private var loading = true
    @State private var requiresLogin = false
    @State private var image: UIImage?
    @State private var error: String?
    @State private var revision = 0
    @State private var saved = CampusPassCache.live.load()
    @State private var cacheError: String?
    @State private var showingLogin = false
    @State private var wasBackgrounded = false

    private var displayedImage: UIImage? { image ?? saved?.image }
    private var loginVisible: Bool { requiresLogin && (saved == nil || showingLogin) }

    var body: some View {
        NavigationStack {
            ZStack {
                CampusPassWebView(loading: $loading, requiresLogin: $requiresLogin, image: $image, error: $error, revision: revision)
                    .opacity(loginVisible ? 1 : 0)
                    .allowsHitTesting(loginVisible)
                    .accessibilityHidden(!loginVisible)
                if let displayedImage, !loginVisible {
                    ScrollView {
                        VStack(spacing: 24) {
                            Image(uiImage: displayedImage).interpolation(.none).resizable().scaledToFit()
                                .padding(24).background(.white, in: RoundedRectangle(cornerRadius: 16))
                                .frame(maxWidth: 360)
                                .accessibilityLabel("QR-код пропуска").accessibilityIdentifier("campus-pass-qr")
                            VStack(spacing: 8) {
                                if let saved, image == nil || cacheError == nil {
                                    Text(image == nil ? "Сохранённый код" : "Код обновлён").font(.subheadline.weight(.medium))
                                    Text(saved.savedAt, format: .dateTime.day().month().hour().minute())
                                        .font(.footnote).foregroundStyle(.secondary)
                                }
                                if image == nil {
                                    if let error { Text(error).font(.footnote).foregroundStyle(.secondary) }
                                    else if loading { ProgressView("Обновляем код").font(.footnote) }
                                    Text("Сохранённый код может быть просрочен").font(.footnote).foregroundStyle(.secondary)
                                }
                                if let cacheError { Text(cacheError).font(.footnote).foregroundStyle(.secondary) }
                            }.multilineTextAlignment(.center)
                            Button("Обновить код", systemImage: "arrow.clockwise", action: refresh)
                                .frame(minHeight: 44)
                            if requiresLogin {
                                Button("Войти в ДГТУ") { showingLogin = true }.frame(minHeight: 44)
                            }
                        }.padding(24).frame(maxWidth: .infinity)
                    }
                } else if let error {
                    ContentUnavailableView {
                        Label("Не удалось получить пропуск", systemImage: "wifi.slash")
                    } description: { Text(error) } actions: {
                        Button("Попробовать снова", action: refresh)
                    }
                } else if !requiresLogin {
                    ProgressView("Получаем свежий QR-код")
                }
            }
            .navigationTitle(loginVisible ? "Вход в ДГТУ" : "Пропуск").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("Готово") { dismiss() } }
                if loginVisible && saved != nil {
                    ToolbarItem(placement: .cancellationAction) { Button("К коду") { showingLogin = false } }
                }
            }
            .onChange(of: image) { _, value in
                guard let value else { return }
                do { saved = try CampusPassCache.live.save(value); cacheError = nil }
                catch { cacheError = "Не удалось сохранить код для открытия без интернета" }
            }
            .onChange(of: phase) { _, value in
                if value == .background {
                    wasBackgrounded = true
                    if !requiresLogin { image = nil }
                } else if value == .active && wasBackgrounded {
                    wasBackgrounded = false
                    // Autofill, Face ID, notifications and password-manager
                    // handoffs must not reload a form the user is completing.
                    if !requiresLogin { refresh() }
                }
            }
        }
    }

    private func refresh() {
        image = nil
        showingLogin = false
        error = nil
        requiresLogin = false
        loading = true
        revision += 1
    }
}
