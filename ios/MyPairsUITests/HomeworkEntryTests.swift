import XCTest

final class HomeworkEntryTests: XCTestCase {
    func testDateChangesKeepSelectionAndLessonActionsInSync() {
        for reducedMotion in [false, true] {
            let app = XCUIApplication()
            app.launchArguments = ["--demo", "--show-schedule"]
            if reducedMotion { app.launchArguments.append("--preview-reduced-motion") }
            app.launch()
            XCTAssertTrue(app.staticTexts["Высшая математика"].waitForExistence(timeout: 15))
            let days = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "schedule-day-"))
            XCTAssertEqual(days.count, 6)
            for index in [0, 4, 1, 5, 2] {
                let date = days.element(boundBy: index)
                date.tap()
                XCTAssertTrue(date.isSelected)
                XCTAssertEqual(days.allElementsBoundByIndex.filter(\.isSelected).count, 1)
            }
            app.buttons["schedule-actions"].tap()
            app.buttons["schedule-today"].tap()
            let lesson = app.staticTexts["Высшая математика"]
            XCTAssertTrue(lesson.waitForExistence(timeout: 5))
            lesson.press(forDuration: 1)
            app.buttons["Записать дз"].tap()
            let summary = app.descendants(matching: .any)["homework-pinned-lesson"].firstMatch
            XCTAssertTrue(summary.waitForExistence(timeout: 5))
            XCTAssertTrue(summary.label.contains("Высшая математика"))
            XCTAssertTrue(summary.label.contains("08:30"))
            app.buttons["Отмена"].tap()
        }
    }

    func testContextMenuWritesToTheSelectedLessonAndResetsForGlobalAdd() {
        let app = XCUIApplication()
        app.launchArguments = ["--demo", "--show-schedule", "--audit-fixtures"]
        app.launch()
        let lesson = app.staticTexts["Высшая математика"]
        XCTAssertTrue(lesson.waitForExistence(timeout: 15))
        lesson.press(forDuration: 1)
        app.buttons["Записать дз"].tap()
        let editor = app.textViews["homework-text"]
        XCTAssertTrue(editor.waitForExistence(timeout: 5))
        XCTAssertFalse(app.segmentedControls.firstMatch.exists)
        XCTAssertFalse(app.descendants(matching: .any)["homework-subject"].firstMatch.exists)
        XCTAssertFalse(app.datePickers.firstMatch.exists)
        let pinned = app.descendants(matching: .any)["homework-pinned-lesson"].firstMatch
        XCTAssertTrue(pinned.label.contains("Высшая математика"))
        XCTAssertTrue(pinned.label.contains("08:30"))
        XCTAssertFalse(app.buttons["Сохранить"].isEnabled)
        editor.tap()
        editor.typeText("Тест точной привязки")
        XCTAssertTrue(app.buttons["Сохранить"].isEnabled)
        let screenshot = XCTAttachment(screenshot: app.screenshot())
        screenshot.name = "homework-contextual-entry"; screenshot.lifetime = .keepAlways; add(screenshot)
        app.buttons["Сохранить"].tap()
        XCTAssertTrue(app.staticTexts["Тест точной привязки"].waitForExistence(timeout: 5))
        app.buttons["schedule-actions"].tap()
        app.buttons["Новое задание"].tap()
        XCTAssertTrue(app.segmentedControls.buttons["С помощью ИИ"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.descendants(matching: .any)["homework-pinned-lesson"].firstMatch.exists)
        app.buttons["Отмена"].tap()
    }

    func testPastLessonCanReceiveHomeworkWithoutChoosingAnotherDate() {
        let app = XCUIApplication()
        app.launchArguments = ["--demo", "--show-schedule", "--audit-fixtures"]
        app.launch()
        XCTAssertTrue(app.buttons["Предыдущая неделя"].waitForExistence(timeout: 15))
        app.buttons["Предыдущая неделя"].tap()
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Europe/Moscow")!
        let past = calendar.date(byAdding: .day, value: -7, to: Date())!
        let formatter = DateFormatter()
        formatter.calendar = calendar; formatter.timeZone = calendar.timeZone
        formatter.locale = Locale(identifier: "en_US_POSIX"); formatter.dateFormat = "yyyy-MM-dd"
        app.buttons["schedule-day-" + formatter.string(from: past)].tap()
        let lesson = app.staticTexts["Прошедшая практика"]
        XCTAssertTrue(lesson.waitForExistence(timeout: 5))
        lesson.press(forDuration: 1)
        app.buttons["Записать дз"].tap()
        let editor = app.textViews["homework-text"]
        XCTAssertTrue(editor.waitForExistence(timeout: 5))
        let pinned = app.descendants(matching: .any)["homework-pinned-lesson"].firstMatch
        XCTAssertTrue(pinned.label.contains("Прошедшая практика"))
        XCTAssertTrue(pinned.label.contains("12:00"))
        editor.tap(); editor.typeText("К прошедшему занятию")
        app.buttons["Сохранить"].tap()
        XCTAssertTrue(app.staticTexts["К прошедшему занятию"].waitForExistence(timeout: 5))
    }

    func testReturningFromSubjectPickerPreservesTextAndSelection() {
        let app = XCUIApplication()
        app.launchArguments = ["--demo", "--show-add"]
        app.launch()
        XCTAssertTrue(app.segmentedControls.buttons["Вручную"].waitForExistence(timeout: 15))
        app.segmentedControls.buttons["Вручную"].tap()
        app.descendants(matching: .any)["homework-subject"].firstMatch.tap()
        app.buttons["Высшая математика"].tap()
        let editor = app.textViews["homework-text"]
        editor.tap(); editor.typeText("Не терять этот текст")
        // Close keyboard before opening another navigation screen.
        app.swipeDown()
        app.descendants(matching: .any)["homework-subject"].firstMatch.tap()
        app.buttons["Информатика и информационно-коммуникационные технологии"].tap()
        if !editor.waitForExistence(timeout: 2) { app.collectionViews.firstMatch.swipeUp() }
        XCTAssertTrue(editor.waitForExistence(timeout: 5))
        XCTAssertEqual(editor.value as? String, "Не терять этот текст")
        XCTAssertTrue(app.buttons["Сохранить"].isEnabled)
        app.buttons["Отмена"].tap()
        XCTAssertTrue(app.buttons["Продолжить запись"].waitForExistence(timeout: 5))
        app.buttons["Продолжить запись"].tap()
        XCTAssertEqual(editor.value as? String, "Не терять этот текст")
    }

    func testHomeworkCanBeCompletedAndReturned() {
        let app = XCUIApplication()
        app.launchArguments = ["--demo", "--show-homework"]
        app.launch()
        let first = app.buttons.matching(identifier: "Отметить выполненным").firstMatch
        XCTAssertTrue(first.waitForExistence(timeout: 15))
        first.tap()
        XCTAssertFalse(app.staticTexts["Решить задачи 1–5, повторить производные"].exists)
        app.buttons["homework-filter"].tap(); app.buttons["Все задания"].tap()
        let completed = app.buttons.matching(identifier: "Вернуть в задания").allElementsBoundByIndex.first { ($0.value as? String) == "Решить задачи 1–5, повторить производные" }
        XCTAssertNotNil(completed)
        completed?.tap()
        app.buttons["homework-filter"].tap(); app.buttons["Невыполненные"].tap()
        XCTAssertTrue(app.staticTexts["Решить задачи 1–5, повторить производные"].exists)
    }

    func testScheduleLongTitlesInBothAppearances() {
        for appearance in ["Light", "Dark"] {
            let app = XCUIApplication()
            app.launchArguments = ["--demo", "--show-schedule", "--preview-\(appearance.lowercased())"]
            app.launch()
            XCTAssertTrue(app.staticTexts["Информатика и информационно-коммуникационные технологии"].waitForExistence(timeout: 15))
            let top = XCTAttachment(screenshot: app.screenshot())
            top.name = "schedule-\(appearance)-top"
            top.lifetime = .keepAlways
            add(top)
            app.scrollViews.firstMatch.swipeUp()
            let metadata = app.staticTexts["Английский · Подгруппа\u{00A0}1"]
            XCTAssertTrue(metadata.waitForExistence(timeout: 5))
            XCTAssertTrue(metadata.isHittable)
            XCTAssertFalse(app.staticTexts["Иностранный язык (английский), п/г 1"].exists)
            let bottom = XCTAttachment(screenshot: app.screenshot())
            bottom.name = "schedule-\(appearance)-language"
            bottom.lifetime = .keepAlways
            add(bottom)
        }
    }

    func testCampusPassOpensAndCloses() {
        let app = XCUIApplication()
        app.launchArguments = ["--demo"]
        app.launch()
        let pass = app.buttons["Пропуск"]
        XCTAssertTrue(pass.waitForExistence(timeout: 15))
        pass.tap()
        XCTAssertTrue(app.buttons["Готово"].waitForExistence(timeout: 5))
        let ready = NSPredicate { _, _ in
            app.navigationBars["Вход в ДГТУ"].exists || app.images["campus-pass-qr"].exists
        }
        expectation(for: ready, evaluatedWith: app)
        waitForExpectations(timeout: 30)
        app.buttons["Готово"].tap()
        XCTAssertTrue(pass.waitForExistence(timeout: 5))
    }

    func testScheduleWeekNavigationAndReturnToToday() {
        let app = XCUIApplication()
        app.launchArguments = ["--demo", "--show-schedule"]
        app.launch()
        XCTAssertTrue(app.staticTexts["Высшая математика"].waitForExistence(timeout: 15))
        app.buttons["Следующая неделя"].tap()
        XCTAssertTrue(app.staticTexts["День без пар"].waitForExistence(timeout: 5))
        app.buttons["schedule-actions"].tap()
        app.buttons["schedule-today"].tap()
        XCTAssertTrue(app.staticTexts["Высшая математика"].waitForExistence(timeout: 5))
        app.buttons["Задания"].tap()
        XCTAssertTrue(app.buttons["homework-filter"].waitForExistence(timeout: 5))
    }

    func testHomeworkFilterShowsCompletedAndCanHideThem() {
        let app = XCUIApplication()
        app.launchArguments = ["--demo", "--show-homework"]
        app.launch()
        let filter = app.buttons["homework-filter"]
        XCTAssertTrue(filter.waitForExistence(timeout: 15))
        XCTAssertTrue(app.staticTexts["Решить задачи 1–5, повторить производные"].exists)
        XCTAssertFalse(app.staticTexts["Прочитать конспект лекции"].exists)
        filter.tap()
        app.buttons["Все задания"].tap()
        XCTAssertTrue(app.staticTexts["Прочитать конспект лекции"].waitForExistence(timeout: 5))
        filter.tap()
        app.buttons["Невыполненные"].tap()
        XCTAssertFalse(app.staticTexts["Прочитать конспект лекции"].exists)
    }

    func testAddFromScheduleAndSwitchInputMode() {
        let app = XCUIApplication()
        app.launchArguments = ["--demo", "--show-add"]
        app.launch()
        XCTAssertTrue(app.navigationBars["Новое ДЗ"].waitForExistence(timeout: 15))
        XCTAssertTrue(app.buttons["Сохранить"].exists)
        XCTAssertFalse(app.buttons["Сохранить"].isEnabled)
        let automatic = app.segmentedControls.buttons["С помощью ИИ"]
        XCTAssertTrue(automatic.exists)
        XCTAssertTrue(automatic.isSelected)
        XCTAssertTrue(app.textViews["Опиши домашнее задание"].exists)
        XCTAssertTrue(app.buttons["Разобрать задание"].exists)
        XCTAssertFalse(app.buttons["Разобрать задание"].isEnabled)
        app.segmentedControls.buttons["Вручную"].tap()
        XCTAssertFalse(app.staticTexts["Сдать до"].exists)
        app.descendants(matching: .any)["homework-subject"].firstMatch.tap()
        let subject = app.buttons["Высшая математика"]
        XCTAssertTrue(subject.waitForExistence(timeout: 5))
        subject.tap()
        XCTAssertTrue(app.staticTexts["Сдать до"].exists)
    }
}
