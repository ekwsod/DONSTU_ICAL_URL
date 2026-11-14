import Foundation

struct HomeworkEditorRequest: Identifiable {
    let id = UUID()
    var lesson: Lesson? = nil
}
