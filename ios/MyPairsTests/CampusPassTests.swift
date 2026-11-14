import XCTest
import WebKit
@testable import MyPairs

@MainActor final class CampusPassTests: XCTestCase, WKScriptMessageHandler {
    private var received: XCTestExpectation?
    private var result: [String: String]?

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let value = message.body as? [String: String], value["kind"] == "qr" else { return }
        result = value
        received?.fulfill()
    }

    func testExportsGeneratedCanvasWithoutProfileContent() async throws {
        received = expectation(description: "Receives only QR image")
        let generation = UUID()
        let controller = WKUserContentController()
        controller.add(self, name: "campusPass")
        controller.addUserScript(WKUserScript(source: CampusPassScript.source(generation: generation), injectionTime: .atDocumentEnd, forMainFrameOnly: true))
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()
        configuration.userContentController = controller
        let view = WKWebView(frame: CGRect(x: 0, y: 0, width: 390, height: 844), configuration: configuration)
        defer { controller.removeScriptMessageHandler(forName: "campusPass"); view.stopLoading() }
        // Synthetic canvas: never a real user's pass. Delayed drawing exercises
        // waiting for generation instead of exporting an empty canvas.
        view.loadHTMLString("""
        <html><body><p>Private profile field</p>
        <div role="dialog"><canvas width="228" height="228"></canvas>
        <span id="state">Формируем код…</span><button disabled>Обновить код</button></div>
        <script>setTimeout(() => {
          const c = document.querySelector('canvas').getContext('2d');
          c.fillStyle='white'; c.fillRect(0,0,228,228);
          c.fillStyle='black'; c.fillRect(20,20,80,80);
          document.querySelector('#state').textContent='Код сформирован: test';
          document.querySelector('button').disabled=false;
        }, 800);</script></body></html>
        """, baseURL: URL(string: "https://lk.donstu.ru/WebApp/#/PersonalKab"))
        await fulfillment(of: [received!], timeout: 10)
        let dataURL = try XCTUnwrap(result?["image"])
        XCTAssertTrue(dataURL.hasPrefix("data:image/png;base64,"))
        let data = try XCTUnwrap(Data(base64Encoded: String(dataURL.dropFirst("data:image/png;base64,".count))))
        let image = try XCTUnwrap(UIImage(data: data))
        XCTAssertEqual(image.size.width, 228)
        XCTAssertEqual(image.size.height, 228)
        XCTAssertEqual(Set(result?.keys.map { $0 } ?? []), ["kind", "image", "generation"])
        XCTAssertEqual(result?["kind"], "qr")
        XCTAssertEqual(result?["generation"], generation.uuidString)
    }
}
