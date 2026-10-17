"""
Тесты логики расчёта будильников:
- Все контрольные примеры: 08:30 -> 07:00; 10:15 -> 08:45; 12:00 -> 10:00; 14:15 -> 10:00; 16:00 -> 10:00; 09:00 -> 07:00; 08:00 -> 07:00 (warning).
- День без пар: alarm_slot = null, notification = «Пар нет, будильник выключен».
- День с несколькими парами: расчёт ведётся строго по первой паре.
- Игнорирование чужих подгрупп при поиске первой пары.
"""

import unittest
from datetime import date, datetime
from zoneinfo import ZoneInfo

from schedule_alarm import Config, ICalEvent, calculate_day_schedule


class TestAlarmCalculation(unittest.TestCase):
    def setUp(self):
        self.tz = ZoneInfo("Europe/Moscow")
        self.config = Config(
            subgroup=1,
            prep_minutes=90,
            latest_alarm="10:00",
            slots=["07:00", "08:45", "10:00"],
            timezone_name="Europe/Moscow"
        )
        self.test_date = date(2026, 10, 17)

    def _make_event(self, time_str: str, summary: str = "Пара", room: str = "8-402") -> ICalEvent:
        hour, minute = map(int, time_str.split(":"))
        dt = datetime(self.test_date.year, self.test_date.month, self.test_date.day, hour, minute, tzinfo=self.tz)
        return ICalEvent(uid=f"id-{time_str}", summary=summary, location=room, dtstart=dt, dtend=None)

    def test_example_08_30(self):
        """08:30 -> target 07:00 -> слот 07:00."""
        event = self._make_event("08:30", "Лек. Высшая математика")
        result = calculate_day_schedule([event], self.test_date, self.config)
        self.assertTrue(result["has_lessons"])
        self.assertEqual(result["first_lesson"], "08:30")
        self.assertEqual(result["alarm_slot"], "07:00")
        self.assertIsNone(result["warning"])
        self.assertEqual(result["notification"], "Первая пара в 08:30, будильник на 07:00")

    def test_example_10_15(self):
        """10:15 -> target 08:45 -> слот 08:45."""
        event = self._make_event("10:15", "Пр. Физика")
        result = calculate_day_schedule([event], self.test_date, self.config)
        self.assertTrue(result["has_lessons"])
        self.assertEqual(result["first_lesson"], "10:15")
        self.assertEqual(result["alarm_slot"], "08:45")
        self.assertIsNone(result["warning"])
        self.assertEqual(result["notification"], "Первая пара в 10:15, будильник на 08:45")

    def test_example_12_00(self):
        """12:00 -> target min(10:30, 10:00) = 10:00 -> слот 10:00."""
        event = self._make_event("12:00", "Лаб. Базы данных")
        result = calculate_day_schedule([event], self.test_date, self.config)
        self.assertEqual(result["first_lesson"], "12:00")
        self.assertEqual(result["alarm_slot"], "10:00")
        self.assertIsNone(result["warning"])
        self.assertEqual(result["notification"], "Первая пара в 12:00, будильник на 10:00")

    def test_example_14_15_and_later(self):
        """14:15 и 16:00 -> target ограничен latest_alarm '10:00' -> слот 10:00."""
        event_14 = self._make_event("14:15", "Лек. История")
        result_14 = calculate_day_schedule([event_14], self.test_date, self.config)
        self.assertEqual(result_14["alarm_slot"], "10:00")

        event_16 = self._make_event("16:00", "Пр. Право")
        result_16 = calculate_day_schedule([event_16], self.test_date, self.config)
        self.assertEqual(result_16["alarm_slot"], "10:00")

    def test_example_09_00(self):
        """09:00 -> target 07:30 -> самый поздний слот <= 07:30 это 07:00."""
        event = self._make_event("09:00", "Семинар")
        result = calculate_day_schedule([event], self.test_date, self.config)
        self.assertEqual(result["first_lesson"], "09:00")
        self.assertEqual(result["alarm_slot"], "07:00")
        self.assertIsNone(result["warning"])
        self.assertEqual(result["notification"], "Первая пара в 09:00, будильник на 07:00")

    def test_example_08_00_early_pair_warning(self):
        """08:00 -> target 06:30 -> нет слота <= 06:30 -> выбирается самый ранний слот (07:00) с предупреждением."""
        event = self._make_event("08:00", "Ранний зачёт")
        result = calculate_day_schedule([event], self.test_date, self.config)
        self.assertEqual(result["first_lesson"], "08:00")
        self.assertEqual(result["alarm_slot"], "07:00")
        self.assertIsNotNone(result["warning"])
        self.assertIn("06:30", result["warning"])
        self.assertIn("Внимание", result["notification"])

    def test_no_lessons_day(self):
        """День без пар: alarm_slot = null, has_lessons = false, notification = 'Пар нет, будильник выключен'."""
        result = calculate_day_schedule([], self.test_date, self.config)
        self.assertFalse(result["has_lessons"])
        self.assertIsNone(result["first_lesson"])
        self.assertIsNone(result["alarm_slot"])
        self.assertEqual(result["lessons_count"], 0)
        self.assertIsNone(result["warning"])
        self.assertEqual(result["notification"], "Пар нет, будильник выключен")

    def test_multiple_lessons_sorted_and_subgroup_filtered(self):
        """Несколько пар: пара подгруппы 2 в 08:30 игнорируется, первой для подгруппы 1 становится пара в 10:15."""
        event_other_sg = self._make_event("08:30", "Лаб. Физика п/г 2")
        event_my_first = self._make_event("10:15", "Лек. Высшая математика")
        event_my_second = self._make_event("12:00", "Пр. Информатика п/г 1")

        events = [event_my_second, event_other_sg, event_my_first]
        result = calculate_day_schedule(events, self.test_date, self.config)

        self.assertEqual(result["lessons_count"], 2)  # Только две пары подгруппы 1
        self.assertEqual(result["first_lesson"], "10:15")
        self.assertEqual(result["alarm_slot"], "08:45")


if __name__ == "__main__":
    unittest.main()
