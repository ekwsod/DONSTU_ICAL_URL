import XCTest
@testable import MyPairs

private struct Reply {
    var status = 200
    var body: Data
    var delay: Duration = .zero
    var error: URLError? = nil
    init(_ json: String, status: Int = 200, delay: Duration = .zero) {
        self.body = Data(json.utf8); self.status = status; self.delay = delay
    }
}

private final class Transport: @unchecked Sendable {
    let lock = NSLock()
    var handler: ((URLRequest) -> Reply)?
    private var requests: [URLRequest] = []
    private var activePosts = 0
    private(set) var maxActivePosts = 0
    func start(_ request: URLRequest) -> Reply {
        lock.lock(); defer { lock.unlock() }
        requests.append(request)
        if request.httpMethod == "POST" { activePosts += 1; maxActivePosts = max(maxActivePosts, activePosts) }
        return handler?(request) ?? Reply("{}", status: 500)
    }
    func finish(_ request: URLRequest) {
        lock.lock(); defer { lock.unlock() }
        if request.httpMethod == "POST" { activePosts -= 1 }
    }
    var count: Int { lock.lock(); defer { lock.unlock() }; return requests.count }
}

private final class MockProtocol: URLProtocol {
    static var transport = Transport()
    private var work: Task<Void, Never>?
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        let transport = Self.transport
        let reply = transport.start(request)
        work = Task {
            do { try await Task.sleep(for: reply.delay) } catch { transport.finish(request); return }
            transport.finish(request)
            if let error = reply.error { client?.urlProtocol(self, didFailWithError: error); return }
            let response = HTTPURLResponse(url: request.url!, statusCode: reply.status, httpVersion: nil, headerFields: ["Content-Type": "application/json"])!
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: reply.body)
            client?.urlProtocolDidFinishLoading(self)
        }
    }
    override func stopLoading() { work?.cancel() }
}

@MainActor final class AppModelNetworkTests: XCTestCase {
    private var session: URLSession!
    private var cache: URL!
    private var transport: Transport!
    private let empty = #"{"lessons":[],"homework":[],"generated_at":null}"#
    private let item = #"{"id":"new","text":"Сохранено","title":"Математика","due_date":"2026-11-20","due_lesson_id":"l","done":false}"#

    override func setUp() {
        transport = Transport(); MockProtocol.transport = transport
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [MockProtocol.self]
        session = URLSession(configuration: config)
        cache = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    }
    override func tearDown() {
        session.invalidateAndCancel()
        try? FileManager.default.removeItem(at: cache)
    }
    private func model() -> AppModel { AppModel(demo: false, session: session, cacheURL: cache) }
    private func waitForRequest() async throws {
        for _ in 0..<100 {
            if transport.count > 0 { return }
            try await Task.sleep(for: .milliseconds(5))
        }
        XCTFail("Request did not start")
    }

    func testRefreshCannotOverwriteANewerHomeworkMutation() async throws {
        let snapshot = empty
        let item = self.item
        transport.handler = { request in
            request.httpMethod == "POST" ? Reply("{\"homework\":[\(item)]}") : Reply(snapshot, delay: .milliseconds(150))
        }
        let model = model()
        let refresh = Task { await model.refresh() }
        try await waitForRequest()
        try await model.mutate(["action": "add", "lesson_id": "l", "text": "Сохранено"])
        await refresh.value
        XCTAssertEqual(model.snapshot.homework.map(\.id), ["new"])
        let restored = try JSONDecoder().decode(Snapshot.self, from: Data(contentsOf: cache))
        XCTAssertEqual(restored.homework.map(\.id), ["new"])
    }
    func testRefreshWaitingForOneWriteDoesNotOverwriteAnotherQueuedWrite() async throws {
        let snapshot = empty
        let item = self.item
        transport.handler = { request in
            request.httpMethod == "POST" ? Reply("{\"homework\":[\(item)]}", delay: .milliseconds(80)) : Reply(snapshot, delay: .milliseconds(200))
        }
        let model = model()
        let first = Task { try await model.mutate(["action": "toggle", "id": "one", "done": true]) }
        try await waitForRequest()
        let refresh = Task { await model.refresh() }
        while !model.loading { await Task.yield() }
        let second = Task { try await model.mutate(["action": "toggle", "id": "two", "done": true]) }
        try await first.value
        try await second.value
        await refresh.value
        XCTAssertEqual(model.snapshot.homework.map(\.id), ["new"])
    }

    func testSimultaneousRefreshCallersBothWaitForOneRequest() async {
        let snapshot = empty
        transport.handler = { _ in Reply(snapshot, delay: .milliseconds(80)) }
        let model = model()
        async let first: Void = model.refresh()
        async let second: Void = model.refresh()
        _ = await (first, second)
        XCTAssertEqual(transport.count, 1)
        XCTAssertFalse(model.loading)
    }
    func testHomeworkWritesAreSerialized() async throws {
        let item = self.item
        transport.handler = { _ in Reply("{\"homework\":[\(item)]}", delay: .milliseconds(80)) }
        let model = model()
        async let first: Void = model.mutate(["action": "toggle", "id": "one", "done": true])
        async let second: Void = model.mutate(["action": "toggle", "id": "two", "done": true])
        _ = try await (first, second)
        XCTAssertEqual(transport.count, 2)
        XCTAssertEqual(transport.maxActivePosts, 1)
    }
    func testServerFailureDoesNotPretendInternetIsOffline() async {
        transport.handler = { _ in Reply(#"{"error":"Плановые работы"}"#, status: 503) }
        let model = model()
        await model.refresh()
        XCTAssertFalse(model.offline)
        XCTAssertEqual(model.error, "Плановые работы")
        XCTAssertFalse(model.loading)
    }
    func testNetworkFailureKeepsCachedHomework() async throws {
        let cached = "{\"lessons\":[],\"homework\":[\(item)],\"generated_at\":null}"
        try Data(cached.utf8).write(to: cache)
        transport.handler = { _ in
            var reply = Reply("{}"); reply.error = URLError(.notConnectedToInternet); return reply
        }
        let model = model()
        await model.refresh()
        XCTAssertTrue(model.offline)
        XCTAssertEqual(model.snapshot.homework.map(\.id), ["new"])
    }
    func testRefreshDuringSignInDoesNotStartAnUnauthenticatedRequest() async throws {
        let snapshot = empty
        transport.handler = { request in
            request.url?.path == "/api/login" ? Reply("{}", delay: .milliseconds(100)) : Reply(snapshot)
        }
        let model = model()
        let login = Task { try await model.login("example-code") }
        try await waitForRequest()
        await model.refresh()
        try await login.value
        XCTAssertEqual(transport.count, 2) // login, then one authenticated GET
        XCTAssertFalse(model.needsLogin)
    }

    func testLoginPerformsFreshAuthenticatedLoad() async throws {
        let snapshot = empty
        var signedIn = false
        transport.handler = { request in
            if request.url?.path == "/api/login" { signedIn = true; return Reply("{}") }
            return signedIn ? Reply(snapshot) : Reply(#"{"error":"Нужен вход"}"#, status: 401)
        }
        let model = model()
        await model.refresh()
        XCTAssertTrue(model.needsLogin)
        try await model.login(" example-code ")
        XCTAssertFalse(model.needsLogin)
        XCTAssertNil(model.error)
        XCTAssertEqual(transport.count, 3)
    }
}
