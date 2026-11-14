import XCTest
import UIKit
@testable import MyPairs

@MainActor final class CampusPassCacheTests: XCTestCase {
    func testLastCodeSurvivesReopeningWithoutAnyNetwork() throws {
        let file = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString).appendingPathComponent("last-code.json")
        defer { try? FileManager.default.removeItem(at: file.deletingLastPathComponent()) }
        let cache = CampusPassCache(file: file)
        XCTAssertNil(cache.load())
        let image = UIGraphicsImageRenderer(size: CGSize(width: 228, height: 228)).image { context in
            UIColor.white.setFill(); context.fill(CGRect(x: 0, y: 0, width: 228, height: 228))
            UIColor.black.setFill(); context.fill(CGRect(x: 20, y: 20, width: 80, height: 80))
        }
        let savedAt = Date(timeIntervalSince1970: 12345)
        let saved = try cache.save(image, at: savedAt)
        let reopened = try XCTUnwrap(CampusPassCache(file: file).load())
        XCTAssertEqual(reopened.png, saved.png)
        XCTAssertEqual(reopened.savedAt, savedAt)
        XCTAssertNotNil(reopened.image)
        let folderValues = try file.deletingLastPathComponent().resourceValues(forKeys: [.isExcludedFromBackupKey])
        XCTAssertEqual(folderValues.isExcludedFromBackup, true)
        let updatedAt = savedAt.addingTimeInterval(60)
        try cache.save(image, at: updatedAt)
        XCTAssertEqual(cache.load()?.savedAt, updatedAt)
    }

    func testCorruptCacheIsIgnored() throws {
        let file = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: file) }
        try Data("broken record".utf8).write(to: file)
        XCTAssertNil(CampusPassCache(file: file).load())
        let invalid = CampusPassCache.Entry(png: Data("not an image".utf8), savedAt: Date())
        try JSONEncoder().encode(invalid).write(to: file)
        XCTAssertNil(CampusPassCache(file: file).load())
    }
}
