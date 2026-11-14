import Foundation

struct LessonDisplay {
    let title: String
    let detail: String?

    init(_ raw: String) {
        var title = raw.replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
        var details: [String] = []
        let pattern = #"(?i)(?:[,;\s]*[\(\[]?)(?:п\s*/?\s*г|подгрупп[аы]|пг)\.?\s*(\d+)[\)\]]?"#
        if let regex = try? NSRegularExpression(pattern: pattern),
           let match = regex.firstMatch(in: title, range: NSRange(title.startIndex..., in: title)),
           let number = Range(match.range(at: 1), in: title), let whole = Range(match.range, in: title) {
            details.append("Подгруппа\u{00A0}" + title[number])
            title.removeSubrange(whole)
        }
        // Language qualifiers are metadata, not a tail squeezed beside a badge.
        if let range = title.range(of: #"\s*\((английский|немецкий|французский|испанский)(?:\s+язык)?\)\s*[,;]?\s*$"#, options: [.regularExpression, .caseInsensitive]) {
            let language = title[range].trimmingCharacters(in: CharacterSet(charactersIn: " (),;"))
            details.insert(language.prefix(1).uppercased() + language.dropFirst(), at: 0)
            title.removeSubrange(range)
        }
        self.title = title.trimmingCharacters(in: CharacterSet.whitespacesAndNewlines.union(CharacterSet(charactersIn: ",;")))
        detail = details.isEmpty ? nil : details.joined(separator: " · ")
    }
}
