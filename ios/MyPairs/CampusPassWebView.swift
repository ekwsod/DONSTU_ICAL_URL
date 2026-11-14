import SwiftUI
import WebKit

struct CampusPassWebView: UIViewRepresentable {
    @Binding var loading: Bool
    @Binding var requiresLogin: Bool
    @Binding var image: UIImage?
    @Binding var error: String?
    let revision: Int

    func makeCoordinator() -> Coordinator { Coordinator(parent: self) }

    func makeUIView(context: Context) -> WKWebView {
        let content = WKUserContentController()
        content.add(context.coordinator, name: "campusPass")
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
        config.userContentController = content
        let view = WKWebView(frame: .zero, configuration: config)
        view.navigationDelegate = context.coordinator
        context.coordinator.load(view)
        return view
    }

    func updateUIView(_ view: WKWebView, context: Context) {
        context.coordinator.parent = self
        if context.coordinator.revision != revision {
            context.coordinator.revision = revision
            context.coordinator.load(view)
        }
    }

    static func dismantleUIView(_ view: WKWebView, coordinator: Coordinator) {
        coordinator.timeout?.cancel()
        view.stopLoading()
        view.configuration.userContentController.removeScriptMessageHandler(forName: "campusPass")
        view.navigationDelegate = nil
    }

    final class Coordinator: NSObject, WKNavigationDelegate, WKScriptMessageHandler {
        var parent: CampusPassWebView
        var revision: Int
        var timeout: Task<Void, Never>?
        var generation = UUID()
        private var activeNavigation: WKNavigation?
        init(parent: CampusPassWebView) { self.parent = parent; revision = parent.revision }

        func load(_ view: WKWebView) {
            timeout?.cancel()
            generation = UUID()
            let content = view.configuration.userContentController
            content.removeAllUserScripts()
            content.addUserScript(WKUserScript(source: CampusPassScript.source(generation: generation), injectionTime: .atDocumentEnd, forMainFrameOnly: true))
            activeNavigation = view.load(URLRequest(url: URL(string: "https://lk.donstu.ru/WebApp/#/PersonalKab")!, cachePolicy: .reloadIgnoringLocalCacheData))
            armTimeout()
        }

        private func armTimeout() {
            timeout?.cancel()
            timeout = Task { @MainActor [weak self] in
                do { try await Task.sleep(for: .seconds(45)) } catch { return }
                guard let self, parent.image == nil, !parent.requiresLogin else { return }
                parent.error = "Кабинет ДГТУ не вернул QR-код. Попробуй обновить пропуск"
                parent.loading = false
            }
        }

        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            guard message.frameInfo.isMainFrame,
                  message.frameInfo.securityOrigin.protocol == "https",
                  message.frameInfo.securityOrigin.host == "lk.donstu.ru",
                  let body = message.body as? [String: String], body["generation"] == generation.uuidString,
                  let kind = body["kind"] else { return }
            switch kind {
            case "login":
                parent.image = nil
                parent.requiresLogin = true
                parent.loading = false
                parent.error = nil
                timeout?.cancel()
            case "generating":
                parent.requiresLogin = false
                parent.loading = true
                armTimeout()
            case "qr":
                guard let dataURL = body["image"], dataURL.hasPrefix("data:image/png;base64,"), dataURL.count < 2_000_000,
                      let bytes = Data(base64Encoded: String(dataURL.dropFirst("data:image/png;base64,".count))),
                      let image = UIImage(data: bytes), image.size.width >= 100, image.size.height >= 100 else { return }
                timeout?.cancel()
                parent.image = image
                parent.requiresLogin = false
                parent.loading = false
                parent.error = nil
            case "unsupported":
                timeout?.cancel()
                parent.error = "Не удалось извлечь QR-код из кабинета ДГТУ"
                parent.loading = false
            default: break
            }
        }

        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            if navigation === activeNavigation { fail(error) }
        }
        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            if navigation === activeNavigation { fail(error) }
        }
        private func fail(_ error: Error) {
            guard (error as NSError).code != NSURLErrorCancelled else { return }
            timeout?.cancel()
            parent.image = nil
            parent.requiresLogin = false
            parent.loading = false
            parent.error = "Проверь подключение к интернету и попробуй ещё раз"
        }
    }
}
