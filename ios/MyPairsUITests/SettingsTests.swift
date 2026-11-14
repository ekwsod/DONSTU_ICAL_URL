import XCTest

final class SettingsTests: XCTestCase {
    func testPreferencesPersistAndScheduleWorksWithoutAnimations() {
        let app = XCUIApplication()
        app.launchArguments = ["--demo", "--show-schedule", "--reset-preferences"]
        app.launch()
        defer { resetPreviewPreferences(app) }
        openSettings(app)
        XCTAssertEqual(app.switches["settings-animations"].value as? String, "1")
        XCTAssertEqual(app.switches["settings-lesson-dots"].value as? String, "1")
        app.buttons["Тёмная"].tap()
        app.buttons["settings-accent"].tap()
        app.buttons["Синий"].tap()
        setSwitch(app, "settings-animations", to: false)
        setSwitch(app, "settings-lesson-dots", to: false)
        capture(app, name: "settings-dark-animations-off")
        app.buttons["Готово"].tap()
        app.buttons["Следующая неделя"].tap()
        XCTAssertTrue(app.staticTexts["День без пар"].waitForExistence(timeout: 5))
        app.buttons["schedule-actions"].tap()
        app.buttons["schedule-today"].tap()
        XCTAssertTrue(app.staticTexts["Высшая математика"].waitForExistence(timeout: 5))
        capture(app, name: "schedule-dark-glass-no-dots")
        app.buttons["Задания"].tap()
        XCTAssertTrue(app.buttons["homework-filter"].waitForExistence(timeout: 5))
        capture(app, name: "homework-dark-blue-accent")
        app.buttons["Сегодня"].tap()
        XCTAssertTrue(app.buttons["Пропуск"].waitForExistence(timeout: 5))
        capture(app, name: "today-dark-blue-accent")

        app.terminate()
        app.launchArguments = ["--demo", "--show-schedule"]
        app.launch()
        openSettings(app)
        XCTAssertEqual(app.switches["settings-animations"].value as? String, "0")
        XCTAssertEqual(app.switches["settings-lesson-dots"].value as? String, "0")
        XCTAssertTrue(app.buttons["Тёмная"].isSelected)
        let accent = app.buttons["settings-accent"]
        XCTAssertTrue(accent.label.contains("Синий") || accent.value as? String == "Синий")
        app.buttons["Светлая"].tap()
        XCTAssertTrue(app.buttons["Светлая"].isSelected)
        capture(app, name: "settings-light")
        app.buttons["Системная"].tap()
        XCTAssertTrue(app.buttons["Системная"].isSelected)
        setSwitch(app, "settings-animations", to: true)
        setSwitch(app, "settings-lesson-dots", to: true)
        app.buttons["Готово"].tap()
        app.buttons["Задания"].tap()
        XCTAssertTrue(app.buttons["homework-filter"].waitForExistence(timeout: 5))
    }

    private func openSettings(_ app: XCUIApplication) {
        XCTAssertTrue(app.buttons["schedule-actions"].waitForExistence(timeout: 15))
        app.buttons["schedule-actions"].tap()
        app.buttons["schedule-settings"].tap()
        XCTAssertTrue(app.navigationBars["Настройки"].waitForExistence(timeout: 5))
    }

    private func setSwitch(_ app: XCUIApplication, _ identifier: String, to enabled: Bool) {
        let control = app.switches[identifier]
        if !control.isHittable { app.collectionViews.firstMatch.swipeUp() }
        let expected = enabled ? "1" : "0"
        if control.value as? String != expected {
            // A Form toggle's accessibility frame includes its label; tap the actual switch.
            control.coordinate(withNormalizedOffset: CGVector(dx: 0.9, dy: 0.5)).tap()
        }
        XCTAssertEqual(control.value as? String, expected)
    }

    private func resetPreviewPreferences(_ app: XCUIApplication) {
        app.terminate()
        app.launchArguments = ["--demo", "--reset-preferences"]
        app.launch()
        app.terminate()
    }

    private func capture(_ app: XCUIApplication, name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name; attachment.lifetime = .keepAlways; add(attachment)
    }
}
