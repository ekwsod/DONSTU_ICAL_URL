"""
Сверка с Worker бота: bot/test/fixtures/parity.json хранит календарь с трудными случаями
и результат этого скрипта на нём. Тот же файл проверяет bot/test/alarm.test.ts для TypeScript-версии.
Если логика здесь изменилась — пересчитайте ожидания в parity.json и перенесите правку в bot/src/alarm.ts.
"""

import json
import unittest
from datetime import date
from pathlib import Path

from schedule_alarm import Config, build_lessons_payload, calculate_day_schedule, parse_ical

FIXTURE = Path(__file__).resolve().parent.parent / "bot" / "test" / "fixtures" / "parity.json"


class TestParityWithWorker(unittest.TestCase):
    def setUp(self):
        self.data = json.loads(FIXTURE.read_text(encoding="utf-8"))
        self.config = Config.load()
        self.events = parse_ical(self.data["ics"], self.config.timezone_name)

    def test_days(self):
        for day, expected in self.data["days"].items():
            with self.subTest(day=day):
                self.assertEqual(calculate_day_schedule(self.events, date.fromisoformat(day), self.config), expected)

    def test_lessons(self):
        payload = build_lessons_payload(self.events, date(2026, 11, 2), self.config.lessons_horizon_days, self.config)
        del payload["generated_at"]
        self.assertEqual(payload, self.data["lessons"])


if __name__ == "__main__":
    unittest.main()
