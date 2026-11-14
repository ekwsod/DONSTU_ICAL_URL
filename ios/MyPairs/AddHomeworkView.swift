import SwiftUI

struct AddHomeworkView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var editor: HomeworkEditorState
    @State private var description = ""
    @State private var busy = false
    @State private var error: String?
    @State private var notice: String?
    @State private var confirmingDiscard = false
    @FocusState private var editingText: Bool

    init(initial: Lesson?) { _editor = State(initialValue: HomeworkEditorState(initial: initial)) }

    private var lessons: [Lesson] { model.snapshot.lessons }
    private var subjects: [String] { Array(Set(lessons.map(\.title))).sorted() }
    private var hasText: Bool {
        !editor.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !description.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var body: some View {
        NavigationStack {
            Form {
                if let pinned = editor.pinned {
                    Section("К этой паре") {
                        VStack(alignment: .leading, spacing: 8) {
                            Text(pinned.title).font(.headline)
                            Text(Dates.title(pinned.date)).font(.subheadline)
                            Text("\(pinned.start) · \(pinned.kind)").font(.subheadline).foregroundStyle(.secondary)
                            if let room = pinned.room { Text(room).font(.subheadline).foregroundStyle(.secondary) }
                        }.accessibilityElement(children: .combine)
                            .accessibilityIdentifier("homework-pinned-lesson")
                        if !lessons.contains(where: { $0.id == pinned.id }) {
                            Text("Пары больше нет в расписании. Закрой форму и выбери актуальное занятие.").foregroundStyle(.secondary)
                        }
                    }
                } else {
                    Section {
                        Picker("Способ записи", selection: $editor.automatic) {
                            Text("С помощью ИИ").tag(true)
                            Text("Вручную").tag(false)
                        }.pickerStyle(.segmented).disabled(busy)
                    }
                }
                if editor.automatic {
                    Section {
                        TextEditor(text: $description).frame(minHeight: 120).disabled(busy)
                            .accessibilityLabel("Опиши домашнее задание")
                    } header: { Text("Что и к какому сроку") } footer: {
                        Text("Например: по матану к пятнице решить номера 1–5 и повторить производные")
                    }
                    Section {
                        Button(action: parse) {
                            HStack { Text("Разобрать задание"); Spacer(); if busy { ProgressView() } else { Image(systemName: "sparkles") } }
                        }.disabled(busy || description.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || description.utf16.count > 2000)
                    }
                } else {
                    if let notice { Section { Text(notice).font(.subheadline).foregroundStyle(.secondary) } }
                    if editor.pinned == nil {
                        Section("Предмет") {
                            Picker("Предмет", selection: Binding(get: { editor.subject }, set: { editor.selectSubject($0, lessons: lessons) })) {
                                Text("Выбрать предмет").tag("")
                                ForEach(subjects, id: \.self) { Text($0).tag($0) }
                            }.pickerStyle(.navigationLink).accessibilityIdentifier("homework-subject").disabled(busy)
                            if subjects.isEmpty { Text("Обнови расписание, чтобы выбрать предмет").font(.footnote).foregroundStyle(.secondary) }
                        }
                        if !editor.subject.isEmpty {
                            Section("Срок") {
                                DatePicker("Сдать до", selection: $editor.due, displayedComponents: .date).disabled(busy)
                                let onDate = editor.dateLessons(in: lessons)
                                if onDate.count > 1 {
                                    Picker("Пара", selection: $editor.lessonID) {
                                        ForEach(onDate) { lesson in Text("\(lesson.start) · \(lesson.kind)").tag(lesson.id) }
                                    }.disabled(busy).accessibilityIdentifier("homework-lesson")
                                } else if let lesson = onDate.first {
                                    Text("\(lesson.start) · \(lesson.kind)").font(.subheadline).foregroundStyle(.secondary)
                                } else {
                                    Text("В этот день пары нет. Задание сохранится на выбранную дату.").font(.footnote).foregroundStyle(.secondary)
                                }
                            }
                        }
                    }
                    Section("Что нужно сделать") {
                        TextEditor(text: $editor.text).frame(minHeight: 140).focused($editingText).disabled(busy)
                            .accessibilityLabel("Текст задания").accessibilityIdentifier("homework-text")
                        if editor.text.utf16.count > 2000 { Text("Максимум 2000 символов").font(.footnote).foregroundStyle(.red) }
                    }
                }
                if let error { Text(error).foregroundStyle(.red).accessibilityIdentifier("homework-error") }
            }
            .navigationTitle(editor.pinned == nil ? "Новое ДЗ" : "ДЗ к паре").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Отмена") { if hasText { confirmingDiscard = true } else { dismiss() } }.disabled(busy)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Сохранить", action: save).disabled(busy || editor.submission(in: lessons) == nil)
                }
            }
            .alert("Удалить несохранённый текст?", isPresented: $confirmingDiscard) {
                Button("Удалить текст", role: .destructive) { dismiss() }
                Button("Продолжить запись", role: .cancel) { }
            }
            .onChange(of: editor.due) { _, _ in editor.alignLessonToDate(in: lessons) }
            .task { if editor.pinned != nil { editingText = true } }
        }.interactiveDismissDisabled(busy || hasText)
    }

    private func parse() {
        guard !busy else { return }
        busy = true; error = nil
        let input = description
        Task { @MainActor in
            defer { busy = false }
            do {
                let draft = try await model.draft(input)
                editor.apply(draft, lessons: lessons)
                notice = editor.subject.isEmpty ? "Предмет не распознан — выбери его вручную" : "Проверь предмет, срок и текст перед сохранением"
            } catch { self.error = error.localizedDescription }
        }
    }
    private func save() {
        guard !busy, let submission = editor.submission(in: lessons) else { return }
        busy = true; error = nil
        Task { @MainActor in
            defer { busy = false }
            do { try await model.mutate(submission.payload); dismiss() }
            catch { self.error = error.localizedDescription }
        }
    }
}
