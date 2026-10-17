"""
Тесты парсера iCal:
- Сворачивание и разворачивание строк
- Экранирование спецсимволов
- Перевод времени UTC -> Europe/Moscow
- Фильтрация подгрупп и обработка общих пар
- Очистка персональных данных (преподаватели, группы)
"""

import unittest
from datetime import datetime
from zoneinfo import ZoneInfo

from schedule_alarm import (
    ICalEvent,
    extract_subgroup,
    is_user_event,
    parse_ical,
    parse_ical_datetime,
    sanitize_room,
    sanitize_title,
    unescape_ical_text,
    unfold_ical,
)


class TestICalParser(unittest.TestCase):
    def test_line_unfolding(self):
        """Проверка разворачивания строк iCal (RFC 5545)."""
        folded = "SUMMARY:Длинное назва\r\n ние дисципли\n\tны с продолжением\r\nLOCATION:8-402"
        unfolded = unfold_ical(folded)
        self.assertIn("SUMMARY:Длинное название дисциплины с продолжением", unfolded)
        self.assertIn("LOCATION:8-402", unfolded)

    def test_unescape_text(self):
        """Проверка декодирования экранированных символов iCal."""
        raw = r"Текст с запятой\, точкой с запятой\; слэшем\\ и переходом\nстроки\Nвновь"
        clean = unescape_ical_text(raw)
        self.assertEqual(clean, "Текст с запятой, точкой с запятой; слэшем\\ и переходом\nстроки\nвновь")

    def test_utc_to_moscow_conversion(self):
        """Проверка конвертации UTC времени со знаком Z в часовой пояс Europe/Moscow (UTC+3)."""
        tz_msk = ZoneInfo("Europe/Moscow")
        # 05:30 UTC = 08:30 MSK
        dt = parse_ical_datetime("20261017T053000Z", tz_msk)
        self.assertEqual(dt.hour, 8)
        self.assertEqual(dt.minute, 30)
        self.assertEqual(dt.tzinfo.key, "Europe/Moscow")

        # 07:15 UTC = 10:15 MSK
        dt2 = parse_ical_datetime("20261017T071500Z", tz_msk)
        self.assertEqual(dt2.hour, 10)
        self.assertEqual(dt2.minute, 15)

    def test_parse_ical_full_event(self):
        """Проверка парсинга корректного iCal документа с несколькими событиями."""
        content = """BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//DSTU//Schedule//RU
BEGIN:VEVENT
UID:evt-1@dstu
DTSTART:20261017T053000Z
DTEND:20261017T070000Z
SUMMARY:Лек. Высшая математика
LOCATION:8-402
END:VEVENT
BEGIN:VEVENT
UID:evt-2@dstu
DTSTART:20261017T071500Z
DTEND:20261017T084500Z
SUMMARY:Пр. Физика п/г 1
LOCATION:8-403
END:VEVENT
END:VCALENDAR"""
        events = parse_ical(content, tz_name="Europe/Moscow")
        self.assertEqual(len(events), 2)
        self.assertEqual(events[0].summary, "Лек. Высшая математика")
        self.assertEqual(events[0].location, "8-402")
        self.assertEqual(events[0].dtstart.strftime("%H:%M"), "08:30")
        self.assertEqual(events[1].dtstart.strftime("%H:%M"), "10:15")

    def test_bom_handling(self):
        """Проверка корректной обработки UTF-8 BOM в начале файла."""
        content = "\ufeffBEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:1\r\nDTSTART:20261017T053000Z\r\nSUMMARY:Пара\r\nEND:VEVENT\r\nEND:VCALENDAR"
        events = parse_ical(content)
        self.assertEqual(len(events), 1)

    def test_invalid_ical_format(self):
        """Проверка выброса исключения при отсутствии BEGIN:VCALENDAR."""
        with self.assertRaises(ValueError):
            parse_ical("<html><body>Error 404</body></html>")


class TestSubgroupFilter(unittest.TestCase):
    def test_extract_subgroup(self):
        """Проверка извлечения номера подгруппы из различных форматов написания."""
        self.assertEqual(extract_subgroup("Лек. Информатика п/г 1"), 1)
        self.assertEqual(extract_subgroup("Лаб. Химия п/г. 2"), 2)
        self.assertEqual(extract_subgroup("Пр. Английский язык (подгруппа 1)"), 1)
        self.assertEqual(extract_subgroup("Лаб. Базы данных 2 п/г"), 2)
        self.assertIsNone(extract_subgroup("Лек. Философия"))
        self.assertIsNone(extract_subgroup("Физкультура"))

    def test_is_user_event(self):
        """Проверка фильтрации: общие пары и пары подгруппы 1 подходят, подгруппы 2 — игнорируются."""
        tz_msk = ZoneInfo("Europe/Moscow")
        dummy_dt = datetime(2026, 10, 17, 8, 30, tzinfo=tz_msk)

        event_common = ICalEvent("1", "Лек. Философия", "8-100", dummy_dt, None)
        event_sub1 = ICalEvent("2", "Лаб. Физика п/г 1", "8-200", dummy_dt, None)
        event_sub2 = ICalEvent("3", "Лаб. Физика п/г 2", "8-201", dummy_dt, None)
        event_pe = ICalEvent("4", "Физкультура", "Спорткомплекс", dummy_dt, None)

        # Для подгруппы 1:
        self.assertTrue(is_user_event(event_common, target_subgroup=1))
        self.assertTrue(is_user_event(event_sub1, target_subgroup=1))
        self.assertFalse(is_user_event(event_sub2, target_subgroup=1))
        self.assertTrue(is_user_event(event_pe, target_subgroup=1))


class TestPrivacySanitizer(unittest.TestCase):
    def test_sanitize_title(self):
        """Проверка удаления пометок подгрупп, шифров групп и ФИО преподавателей из заголовка."""
        raw_1 = "Лаб. Программирование п/г 1 Иванов И. И."
        self.assertEqual(sanitize_title(raw_1), "Лаб. Программирование")

        raw_2 = "Пр. Математика (подгруппа 2) гр. БВТ2101 Петров А. Б."
        self.assertEqual(sanitize_title(raw_2), "Пр. Математика")

        raw_3 = "Физкультура"
        self.assertEqual(sanitize_title(raw_3), "Физкультура")

    def test_sanitize_room(self):
        """Проверка очистки номера аудитории."""
        self.assertEqual(sanitize_room("  8-402 \n"), "8-402")
        self.assertIsNone(sanitize_room(""))


if __name__ == "__main__":
    unittest.main()
