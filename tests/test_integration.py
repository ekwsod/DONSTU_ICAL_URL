"""
Интеграционные тесты и тесты CLI:
- Проверка структуры payload (включая завтрашний день tomorrow)
- Проверка завершения с ошибкой при пустом календаре / отсутствии событий
- Проверка работы через аргументы командной строки (--file, --today, --output)
- Необязательный дымовой тест с samples/calendar.ics
"""

import json
import os
import subprocess
import sys
import tempfile
import unittest
from datetime import date
from pathlib import Path

from schedule_alarm import Config, generate_schedule_payload, parse_ical

SAMPLE_ICAL = """BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//DSTU//Schedule//RU
BEGIN:VEVENT
UID:evt-today@dstu
DTSTART:20261017T053000Z
DTEND:20261017T070000Z
SUMMARY:Лек. Базы данных
LOCATION:8-402
END:VEVENT
BEGIN:VEVENT
UID:evt-tomorrow@dstu
DTSTART:20261018T071500Z
DTEND:20261018T084500Z
SUMMARY:Пр. Операционные системы п/г 1
LOCATION:8-501
END:VEVENT
END:VCALENDAR"""


class TestScheduleIntegration(unittest.TestCase):
    def setUp(self):
        self.config = Config.load()

    def test_payload_structure(self):
        """Проверка полной структуры JSON и равенства полей в корне и в объекте tomorrow."""
        events = parse_ical(SAMPLE_ICAL, tz_name="Europe/Moscow")
        payload = generate_schedule_payload(events, date(2026, 10, 17), self.config)

        # Проверка корневых полей
        self.assertIn("generated_at", payload)
        self.assertEqual(payload["for_date"], "2026-10-17")
        self.assertTrue(payload["has_lessons"])
        self.assertEqual(payload["first_lesson"], "08:30")
        self.assertEqual(payload["alarm_slot"], "07:00")
        self.assertEqual(payload["all_slots"], ["07:00", "08:45", "10:00"])

        # Проверка объекта tomorrow
        self.assertIn("tomorrow", payload)
        tomorrow = payload["tomorrow"]
        self.assertEqual(tomorrow["for_date"], "2026-10-18")
        self.assertTrue(tomorrow["has_lessons"])
        self.assertEqual(tomorrow["first_lesson"], "10:15")
        self.assertEqual(tomorrow["alarm_slot"], "08:45")
        self.assertEqual(tomorrow["all_slots"], ["07:00", "08:45", "10:00"])

    def test_cli_execution_with_file_and_today(self):
        """Тест запуска скрипта через CLI с флагами --file, --today и --output."""
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp_path = Path(tmpdir)
            ics_file = tmp_path / "test.ics"
            ics_file.write_text(SAMPLE_ICAL, encoding="utf-8")
            out_file = tmp_path / "schedule.json"

            cmd = [
                sys.executable,
                "schedule_alarm.py",
                "--file", str(ics_file),
                "--today", "2026-10-17",
                "--output", str(out_file),
            ]
            result = subprocess.run(cmd, capture_output=True, text=True, cwd=str(Path(__file__).resolve().parent.parent))
            self.assertEqual(result.returncode, 0, f"Ошибка CLI: {result.stderr}")
            self.assertTrue(out_file.is_file())

            data = json.loads(out_file.read_text(encoding="utf-8"))
            self.assertEqual(data["for_date"], "2026-10-17")
            self.assertEqual(data["first_lesson"], "08:30")

    def test_cli_fails_on_empty_calendar_without_overwriting(self):
        """Скрипт должен завершаться с ненулевым кодом и не создавать/не перезаписывать файл при пустом календаре."""
        empty_ical = "BEGIN:VCALENDAR\nVERSION:2.0\nEND:VCALENDAR"
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp_path = Path(tmpdir)
            ics_file = tmp_path / "empty.ics"
            ics_file.write_text(empty_ical, encoding="utf-8")
            out_file = tmp_path / "schedule.json"
            out_file.write_text("{\"old\": true}", encoding="utf-8")

            cmd = [
                sys.executable,
                "schedule_alarm.py",
                "--file", str(ics_file),
                "--today", "2026-10-17",
                "--output", str(out_file),
            ]
            result = subprocess.run(cmd, capture_output=True, text=True, cwd=str(Path(__file__).resolve().parent.parent))
            self.assertNotEqual(result.returncode, 0)

            # Проверяем, что исходный файл не был повреждён или перезаписан
            self.assertEqual(out_file.read_text(encoding="utf-8"), "{\"old\": true}")

    @unittest.skipUnless(os.path.exists("samples/calendar.ics"), "Локальный файл samples/calendar.ics отсутствует")
    def test_smoke_with_local_sample(self):
        """Дымовой тест на реальном локальном файле samples/calendar.ics (если он добавлен пользователем)."""
        with open("samples/calendar.ics", "r", encoding="utf-8") as f:
            content = f.read()
        events = parse_ical(content, tz_name="Europe/Moscow")
        self.assertGreater(len(events), 0)


if __name__ == "__main__":
    unittest.main()
