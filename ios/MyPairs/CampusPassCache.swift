import Foundation
import UIKit

struct CampusPassCache {
    struct Entry: Codable {
        let png: Data
        let savedAt: Date
        var image: UIImage? { UIImage(data: png) }
    }

    let file: URL
    static var live: CampusPassCache {
        let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        return CampusPassCache(file: support.appendingPathComponent("CampusPass/last-code.json"))
    }

    func load() -> Entry? {
        guard let data = try? Data(contentsOf: file),
              let entry = try? JSONDecoder().decode(Entry.self, from: data), entry.image != nil else { return nil }
        return entry
    }

    @discardableResult func save(_ image: UIImage, at date: Date = Date()) throws -> Entry {
        guard let png = image.pngData() else { throw CocoaError(.fileWriteUnknown) }
        let entry = Entry(png: png, savedAt: date)
        var directory = file.deletingLastPathComponent()
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        try directory.setResourceValues(values)
        // One protected, atomic record keeps image and timestamp consistent.
        try JSONEncoder().encode(entry).write(to: file, options: [.atomic, .completeFileProtection])
        return entry
    }
}
