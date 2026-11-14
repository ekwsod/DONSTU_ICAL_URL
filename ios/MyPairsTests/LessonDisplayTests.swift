import XCTest
@testable import MyPairs

final class LessonDisplayTests: XCTestCase {
    func testSeparatesLanguageAndBrokenSubgroupFromTitle() {
        let value = LessonDisplay("Иностранный язык (английский), п/\nг 1")
        XCTAssertEqual(value.title, "Иностранный язык")
        XCTAssertEqual(value.detail, "Английский · Подгруппа\u{00A0}1")
    }
    func testPreservesOtherParenthesesAndSubjectSpelling() {
        let title = "Информатика и информационно-коммуникационные технологии"
        XCTAssertEqual(LessonDisplay(title).title, title)
        XCTAssertNil(LessonDisplay(title).detail)
        XCTAssertEqual(LessonDisplay("Физическая культура (элективная)").title, "Физическая культура (элективная)")
    }
    func testSubgroupWithoutLanguage() {
        let value = LessonDisplay("Практикум, подгруппа 2")
        XCTAssertEqual(value.title, "Практикум")
        XCTAssertEqual(value.detail, "Подгруппа\u{00A0}2")
    }
}
