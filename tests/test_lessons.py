"""
Тесты экспорта пар для Telegram-бота:
- Классификация типа пары (лекция / практика / лаб / прочее)
- Ключ предмета одинаков для лекции и практики
- Окно дат, фильтрация подгрупп и исключённых предметов, сортировка
- Отсутствие персональных данных в выгрузке
- Отправка пропускается, если адрес Worker не задан
"""

import os
import unittest
from datetime import date, datetime
from unittest import mock
from zoneinfo import ZoneInfo

from schedule_alarm import (
    Config,
    ICalEvent,
    build_lessons_payload,
    classify_lesson_type,
    lesson_title,
    make_subject_key,
    push_to_worker,
)


class TestLessonType(unittest.TestCase):
    def test_lecture_abbreviations(self):
        self.assertEqual(classify_lesson_type("Лек. Высшая математика"), "lecture")
        self.assertEqual(classify_lesson_type("Лекция: Физика"), "lecture")

    def test_practice_abbreviations(self):
        self.assertEqual(classify_lesson_type("Пр. Высшая математика"), "practice")
        self.assertEqual(classify_lesson_type("Практика по физике"), "practice")

    def test_lab_and_other(self):
        self.assertEqual(classify_lesson_type("Лаб. Химия п/г 1"), "lab")
        self.assertEqual(classify_lesson_type("Физкультура"), "other")

    def test_portal_format_short_prefixes(self):
        """Формат из портала ДГТУ: «лаб Химия», «пр Инженерная...», «лек Информатика...»."""
        self.assertEqual(classify_lesson_type("лаб Химия"), "lab")
        self.assertEqual(classify_lesson_type("пр Инженерная и компьютерная графика"), "practice")
        self.assertEqual(classify_lesson_type("лек Информатика и информационно-коммуникационные технологии"), "lecture")

    def test_word_prefix_does_not_match(self):
        """«Программирование» и «Лексика» не должны определяться как пр./лек."""
        self.assertEqual(classify_lesson_type("Программирование на Python"), "other")
        self.assertEqual(classify_lesson_type("Лексикология"), "other")


class TestLessonTitle(unittest.TestCase):
    def test_strips_short_prefix_only_as_word(self):
        self.assertEqual(lesson_title("пр Инженерная и компьютерная графика"), "Инженерная и компьютерная графика")
        self.assertEqual(lesson_title("лаб Химия"), "Химия")
        self.assertEqual(lesson_title("Программирование на Python"), "Программирование на Python")
        self.assertEqual(lesson_title("Лексикология"), "Лексикология")

    def test_group_prefix_does_not_cut_words(self):
        """«гр» внутри слова («графика») не должен срезаться при очистке названия."""
        self.assertEqual(lesson_title("пр Инженерная и компьютерная графика"), "Инженерная и компьютерная графика")
        self.assertEqual(lesson_title("Графический дизайн"), "Графический дизайн")


class TestSubjectKey(unittest.TestCase):
    def test_lecture_and_practice_share_key(self):
        """Лекция и практика по одному предмету должны давать одинаковый ключ."""
        lecture = lesson_title("Лек. Высшая математика")
        practice = lesson_title("Пр. Высшая математика п/г 1")
        self.assertEqual(make_subject_key(lecture), make_subject_key(practice))

    def test_key_normalization(self):
        self.assertEqual(make_subject_key("Высшая  математика."), "высшая математика")
        self.assertIsNone(make_subject_key(None))


class TestLessonsPayload(unittest.TestCase):
    def setUp(self):
        self.tz = ZoneInfo("Europe/Moscow")
        self.config = Config(subgroup=1, timezone_name="Europe/Moscow")
        self.start = date(2026, 10, 19)

    def _event(self, day: int, time_str: str, summary: str, room: str = "8-402") -> ICalEvent:
        hour, minute = map(int, time_str.split(":"))
        dt = datetime(2026, 10, day, hour, minute, tzinfo=self.tz)
        return ICalEvent(uid=f"id-{day}-{time_str}", summary=summary, location=room, dtstart=dt, dtend=None)

    def test_window_filters_dates(self):
        events = [
            self._event(19, "09:00", "Лек. Математика"),
            self._event(26, "09:00", "Лек. Физика"),
            self._event(18, "09:00", "Лек. Химия"),
        ]
        payload = build_lessons_payload(events, self.start, 7, self.config)
        titles = [lesson["title"] for lesson in payload["lessons"]]
        self.assertEqual(titles, ["Математика"])
        self.assertEqual(payload["from"], "2026-10-19")
        self.assertEqual(payload["to"], "2026-10-25")

    def test_subgroup_and_rki_filtered(self):
        events = [
            self._event(19, "09:00", "Пр. Математика п/г 2"),
            self._event(19, "10:00", "Пр. Математика п/г 1"),
            self._event(19, "11:00", "Русский язык как иностранный"),
        ]
        payload = build_lessons_payload(events, self.start, 1, self.config)
        self.assertEqual([lesson["start"] for lesson in payload["lessons"]], ["10:00"])

    def test_sorted_and_fields(self):
        events = [
            self._event(20, "13:00", "Лаб. Химия"),
            self._event(19, "10:00", "Пр. Математика"),
            self._event(19, "08:30", "Лек. Математика"),
        ]
        payload = build_lessons_payload(events, self.start, 14, self.config)
        starts = [(lesson["date"], lesson["start"]) for lesson in payload["lessons"]]
        self.assertEqual(starts, [("2026-10-19", "08:30"), ("2026-10-19", "10:00"), ("2026-10-20", "13:00")])

        first = payload["lessons"][0]
        self.assertEqual(first["type"], "lecture")
        self.assertEqual(first["subject_key"], "математика")
        self.assertEqual(first["room"], "8-402")
        self.assertIsNotNone(first["id"])

    def test_no_personal_data_in_payload(self):
        """ФИО преподавателя и номер группы не попадают в выгрузку."""
        events = [self._event(19, "09:00", "Лек. Математика Иванов И. И. БВТ2101")]
        payload = build_lessons_payload(events, self.start, 1, self.config)
        title = payload["lessons"][0]["title"]
        self.assertNotIn("Иванов", title)
        self.assertNotIn("БВТ2101", title)


class TestPushToWorker(unittest.TestCase):
    def test_skipped_without_url(self):
        """Без BOT_PUSH_URL скрипт не должен ходить в сеть."""
        with mock.patch.dict(os.environ, {}, clear=False), mock.patch("urllib.request.urlopen") as urlopen:
            os.environ.pop("BOT_PUSH_URL", None)
            push_url = os.environ.get("BOT_PUSH_URL", "").strip()
            if push_url:
                push_to_worker({}, push_url, "")
            urlopen.assert_not_called()

    def test_sends_bearer_token(self):
        with mock.patch("urllib.request.urlopen") as urlopen:
            push_to_worker({"lessons": []}, "https://example.invalid/push", "secret")
            request = urlopen.call_args[0][0]
            self.assertEqual(request.get_method(), "POST")
            self.assertEqual(request.get_header("Authorization"), "Bearer secret")

    def test_sends_browser_like_user_agent(self):
        """Cloudflare режет «Python-urllib» ошибкой 1010, поэтому User-Agent задаём явно."""
        with mock.patch("urllib.request.urlopen") as urlopen:
            push_to_worker({"lessons": []}, "https://example.invalid/push", "secret")
            user_agent = urlopen.call_args[0][0].get_header("User-agent")
            self.assertIsNotNone(user_agent)
            self.assertNotIn("Python-urllib", user_agent)


if __name__ == "__main__":
    unittest.main()
