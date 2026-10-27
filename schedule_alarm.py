#!/usr/bin/env python3
"""
Автоматизация расчёта будильников по iCal-расписанию университета.
Язык сообщений и комментариев: русский.
Идентификаторы: английский.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo


@dataclass
class Config:
    """Конфигурация параметров будильника и студента."""
    subgroup: int = 1
    prep_minutes: int = 90
    latest_alarm: str = "10:00"
    slots: list[str] = None
    timezone_name: str = "Europe/Moscow"
    exclude_keywords: list[str] = None
    lessons_horizon_days: int = 28

    def __post_init__(self):
        if self.slots is None:
            self.slots = ["07:00", "08:45", "10:00"]
        # Сортируем слоты по времени
        self.slots = sorted(self.slots, key=time_str_to_minutes)
        if self.exclude_keywords is None:
            self.exclude_keywords = [
                "русский язык как иностранный",
                "русский как иностранный",
                "рки",
            ]

    @classmethod
    def load(cls, path: str | Path | None = None) -> Config:
        """Загрузка конфигурации из JSON-файла с безопасными значениями по умолчанию."""
        if path is None:
            path = Path(__file__).resolve().parent / "config.json"
        else:
            path = Path(path)

        if not path.is_file():
            return cls()

        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
            exclude_kw = data.get("exclude_keywords")
            if exclude_kw is None:
                exclude_kw = [
                    "русский язык как иностранный",
                    "русский как иностранный",
                    "рки",
                ]
            return cls(
                subgroup=int(data.get("subgroup", 1)),
                prep_minutes=int(data.get("prep_minutes", 90)),
                latest_alarm=str(data.get("latest_alarm", "10:00")),
                slots=list(data.get("slots", ["07:00", "08:45", "10:00"])),
                timezone_name=str(data.get("timezone", "Europe/Moscow")),
                exclude_keywords=list(exclude_kw),
                lessons_horizon_days=int(data.get("lessons_horizon_days", 28)),
            )
        except Exception:
            # При любой ошибке парсинга конфига возвращаем стандартные значения
            return cls()


@dataclass
class ICalEvent:
    """Модель учебного события календаря."""
    uid: str
    summary: str
    location: str
    dtstart: datetime
    dtend: datetime | None


def time_str_to_minutes(val: str) -> int:
    """Преобразование строки формата 'ЧЧ:ММ' в количество минут от начала суток."""
    parts = val.strip().split(":")
    return int(parts[0]) * 60 + int(parts[1])


def minutes_to_time_str(minutes: int) -> str:
    """Преобразование количества минут от начала суток в строку 'ЧЧ:ММ'."""
    hours = (minutes // 60) % 24
    mins = minutes % 60
    return f"{hours:02d}:{mins:02d}"


def unfold_ical(text: str) -> str:
    """
    Разворачивание длинных строк iCal (RFC 5545, раздел 3.1).
    Строка, начинающаяся с пробела или табуляции, объединяется с предыдущей.
    """
    return re.sub(r"\r?\n[ \t]", "", text)


def unescape_ical_text(val: str) -> str:
    """Раскрытие экранированных символов iCal (\\,, \\;, \\\\, \\n, \\N)."""
    def replace_escape(match: re.Match) -> str:
        char = match.group(1)
        if char in ("n", "N"):
            return "\n"
        return char

    return re.sub(r"\\([\\;,nN])", replace_escape, val)


def parse_ical_datetime(val: str, target_tz: ZoneInfo) -> datetime:
    """
    Парсинг даты/времени iCal (поддерживает UTC с суффиксом Z и локальное время).
    Всегда возвращает aware datetime в целевом часовом поясе.
    """
    clean_val = val.strip()
    if clean_val.endswith("Z"):
        dt = datetime.strptime(clean_val, "%Y%m%dT%H%M%SZ").replace(tzinfo=timezone.utc)
        return dt.astimezone(target_tz)

    # Без суффикса Z: пробуем стандартный вид YYYYMMDDTHHMMSS
    dt_str = clean_val[:15]
    dt = datetime.strptime(dt_str, "%Y%m%dT%H%M%S")
    return dt.replace(tzinfo=target_tz)


def parse_ical(content: str, tz_name: str = "Europe/Moscow") -> list[ICalEvent]:
    """
    Парсер календаря iCal без сторонних библиотек.
    Проверяет валидность VCALENDAR и извлекает события VEVENT.
    """
    # Удаляем возможный UTF-8 BOM и пробельные символы в начале
    clean_content = content.lstrip("\ufeff \t\r\n")
    if not clean_content.startswith("BEGIN:VCALENDAR") and "BEGIN:VCALENDAR" not in clean_content:
        raise ValueError("Ответ не является корректным iCalendar: отсутствует BEGIN:VCALENDAR")

    unfolded = unfold_ical(clean_content)
    target_tz = ZoneInfo(tz_name)
    events: list[ICalEvent] = []

    # Разделяем на блоки VEVENT
    raw_events = re.findall(r"BEGIN:VEVENT\r?\n(.*?)\r?\nEND:VEVENT", unfolded, re.DOTALL)
    for raw_block in raw_events:
        fields: dict[str, str] = {}
        for line in raw_block.splitlines():
            line = line.strip()
            if not line or ":" not in line:
                continue
            key_part, val_part = line.split(":", 1)
            # Параметры свойства (например, DTSTART;VALUE=DATE-TIME)
            prop_name = key_part.split(";")[0].strip().upper()
            fields[prop_name] = val_part

        if "DTSTART" not in fields:
            continue

        try:
            dtstart = parse_ical_datetime(fields["DTSTART"], target_tz)
        except Exception:
            continue

        dtend = None
        if "DTEND" in fields:
            try:
                dtend = parse_ical_datetime(fields["DTEND"], target_tz)
            except Exception:
                dtend = None

        summary = unescape_ical_text(fields.get("SUMMARY", ""))
        location = unescape_ical_text(fields.get("LOCATION", ""))
        uid = fields.get("UID", "")

        events.append(ICalEvent(
            uid=uid,
            summary=summary,
            location=location,
            dtstart=dtstart,
            dtend=dtend
        ))

    return events


def extract_subgroup(summary: str) -> int | None:
    """
    Поиск номера подгруппы в названии пары (например: 'п/г 1', 'п/г. 2', 'подгруппа 1', '1 п/г').
    Возвращает номер подгруппы или None, если пара общая.
    """
    match = re.search(r"(?:п/?г|подгрупп[аы]|пг)\.?\s*(\d+)", summary, re.IGNORECASE)
    if match:
        return int(match.group(1))

    match_rev = re.search(r"(\d+)\s*(?:п/?г|подгрупп[аы])", summary, re.IGNORECASE)
    if match_rev:
        return int(match_rev.group(1))

    return None


def is_user_event(event: ICalEvent, target_subgroup: int, exclude_keywords: list[str] | None = None) -> bool:
    """
    Проверка, относится ли событие к выбранной подгруппе.
    Пара считается своей, если:
    1. Название не содержит исключённых ключевых слов (например, 'русский язык как иностранный').
    2. В ней нет пометки подгруппы (общая пара) или указана именно наша подгруппа.
    """
    summary = event.summary.strip()
    summary_lower = summary.lower()

    # Проверка списка исключений (например, русский язык как иностранный)
    if exclude_keywords:
        for kw in exclude_keywords:
            kw_clean = kw.strip().lower()
            if not kw_clean:
                continue
            if kw_clean in summary_lower:
                return False
            # Проверка основы слова для учета русских окончаний (падежей)
            stem = re.sub(r"[аяоеиыейью]$", "", kw_clean)
            if len(stem) >= 4 and stem in summary_lower:
                return False

    # Встроенный фильтр РКИ (русский язык как иностранный в различных написаниях)
    if re.search(r"русск\w*.*иностранн\w*|иностранн\w*.*русск\w*|\bрки\b", summary_lower):
        return False

    sg = extract_subgroup(summary)
    if sg is None:
        return True
    return sg == target_subgroup


def sanitize_title(summary: str) -> str | None:
    """
    Очистка названия предмета для публичного JSON:
    - Удаляет пометки подгрупп
    - Удаляет возможные фамилии преподавателей (Иванов И. И.)
    - Удаляет шифры групп
    - Убирает лишние знаки препинания и пробелы
    """
    if not summary:
        return None

    text = summary.strip()
    # Удаляем пометки подгруппы вида (п/г 1), п/г 1, подгруппа 1
    text = re.sub(r"[\(\[\{]?(?:п/?г|подгрупп[аы]|пг)\.?\s*\d+[\)\]\}]?", "", text, flags=re.IGNORECASE)
    text = re.sub(r"[\(\[\{]?\d+\s*(?:п/?г|подгрупп[аы])[\)\]\}]?", "", text, flags=re.IGNORECASE)

    # Удаляем фамилии с инициалами (например: Иванов И. И., Петров А.Б.)
    text = re.sub(r"\b[А-ЯЁ][а-яё]+\s+[А-ЯЁ]\.\s*[А-ЯЁ]?\.?", "", text)

    # Удаляем названия академических групп и префиксы групп (например: БВТ2101, ИСТ-31, гр. 101)
    text = re.sub(r"\b(?:гр\.?(?=\s|\d|$)|групп[аы](?=\s|\d|$))\s*", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\b[А-Яа-яA-Za-z]{2,5}-?\d{2,4}\b", "", text)

    # Очищаем лишние разделители в начале и конце
    text = re.sub(r"^[,\-–—:\s]+|[,\-–—:\s]+$", "", text)
    text = re.sub(r"\s{2,}", " ", text).strip()

    return text if text else None


def sanitize_room(location: str) -> str | None:
    """Очистка аудитории: убирает лишние пробелы, сохраняет номер аудитории."""
    if not location:
        return None
    cleaned = location.strip()
    return cleaned if cleaned else None


def calculate_day_schedule(events: list[ICalEvent], target_date: date, config: Config) -> dict:
    """
    Расчёт расписания и будильника на конкретный день:
    target = min(начало первой пары - prep_minutes, latest_alarm).
    Слот = самый поздний слот из config.slots, который <= target.
    Если такого нет — берется самый ранний слот с предупреждением.
    """
    # Фильтруем события по дате и подгруппе (с учетом исключенных предметов)
    day_events = [
        e for e in events
        if e.dtstart.date() == target_date and is_user_event(e, config.subgroup, config.exclude_keywords)
    ]

    # Сортируем пары по времени начала
    day_events.sort(key=lambda e: e.dtstart)

    date_str = target_date.isoformat()

    if not day_events:
        return {
            "for_date": date_str,
            "has_lessons": False,
            "first_lesson": None,
            "first_title": None,
            "first_room": None,
            "lessons_count": 0,
            "alarm_slot": None,
            "all_slots": config.slots,
            "warning": None,
            "notification": "Пар нет, будильник выключен",
        }

    first_event = day_events[0]
    first_lesson_minutes = first_event.dtstart.hour * 60 + first_event.dtstart.minute
    first_lesson_str = f"{first_event.dtstart.hour:02d}:{first_event.dtstart.minute:02d}"

    latest_alarm_minutes = time_str_to_minutes(config.latest_alarm)
    target_minutes = min(first_lesson_minutes - config.prep_minutes, latest_alarm_minutes)

    # Ищем самый поздний слот, который не позже target_minutes
    valid_slots = [s for s in config.slots if time_str_to_minutes(s) <= target_minutes]

    warning: str | None = None
    if valid_slots:
        alarm_slot = valid_slots[-1]
    else:
        # Пара раньше обычного, даже самый ранний слот позже расчетного времени
        alarm_slot = config.slots[0]
        target_str = minutes_to_time_str(target_minutes)
        warning = f"Первая пара в {first_lesson_str} — будильник на {alarm_slot} может быть поздним (расчётное время {target_str})"

    if warning:
        notification = f"Первая пара в {first_lesson_str}, будильник на {alarm_slot}. Внимание: {warning}"
    else:
        notification = f"Первая пара в {first_lesson_str}, будильник на {alarm_slot}"

    return {
        "for_date": date_str,
        "has_lessons": True,
        "first_lesson": first_lesson_str,
        "first_title": sanitize_title(first_event.summary),
        "first_room": sanitize_room(first_event.location),
        "lessons_count": len(day_events),
        "alarm_slot": alarm_slot,
        "all_slots": config.slots,
        "warning": warning,
        "notification": notification,
    }


def classify_lesson_type(summary: str) -> str:
    """
    Определение типа пары по названию: lecture / practice / lab / other.
    Сокращения из расписания ДГТУ: «Лек.», «Пр.», «Лаб.» и их полные формы.
    """
    summary_lower = summary.lower()
    if re.search(r"\bлек(?:ция|\.|\s|$)", summary_lower):
        return "lecture"
    if re.search(r"\bпр(?:\.|\s|$)|практик", summary_lower):
        return "practice"
    if re.search(r"\bлаб(?:\.|\s|$)|лабораторн", summary_lower):
        return "lab"
    return "other"


def lesson_title(summary: str) -> str | None:
    """Название предмета без пометки типа пары («Лек.», «Пр.», «Лаб.») и без персональных данных."""
    title = sanitize_title(summary)
    if not title:
        return None
    title = re.sub(r"^(?:лек(?:ция)?|пр(?:актика)?|лаб(?:ораторная)?)\.?(?=\s|$)\s*", "", title, flags=re.IGNORECASE)
    return title.strip() or None


def make_subject_key(title: str | None) -> str | None:
    """Ключ предмета для связи лекции и практики: нижний регистр, без знаков препинания и лишних пробелов."""
    if not title:
        return None
    key = re.sub(r"[^\w\s]", "", title.lower())
    key = re.sub(r"\s+", " ", key).strip()
    return key or None


def make_lesson_id(uid: str, dtstart: datetime) -> str:
    """Стабильный идентификатор пары: uid события и время начала."""
    raw = f"{uid}|{dtstart.isoformat()}".encode("utf-8")
    return hashlib.sha1(raw).hexdigest()[:16]


def build_lessons_payload(events: list[ICalEvent], start_date: date, days: int, config: Config) -> dict:
    """
    Список пар на окно дат [start_date, start_date + days) для Telegram-бота.
    Фильтрация по подгруппе и исключениям та же, что и для будильника.
    Персональные данные (ФИО, группы) очищаются через sanitize_title.
    """
    end_date = start_date + timedelta(days=days)
    lessons = []

    for event in events:
        event_date = event.dtstart.date()
        if not (start_date <= event_date < end_date):
            continue
        if not is_user_event(event, config.subgroup, config.exclude_keywords):
            continue

        title = lesson_title(event.summary)
        lessons.append({
            "id": make_lesson_id(event.uid, event.dtstart),
            "date": event_date.isoformat(),
            "start": f"{event.dtstart.hour:02d}:{event.dtstart.minute:02d}",
            "end": f"{event.dtend.hour:02d}:{event.dtend.minute:02d}" if event.dtend else None,
            "title": title,
            "subject_key": make_subject_key(title),
            "type": classify_lesson_type(event.summary),
            "room": sanitize_room(event.location),
        })

    lessons.sort(key=lambda lesson: (lesson["date"], lesson["start"]))

    return {
        "generated_at": datetime.now(ZoneInfo(config.timezone_name)).isoformat(),
        "from": start_date.isoformat(),
        "to": (end_date - timedelta(days=1)).isoformat(),
        "lessons": lessons,
    }


def push_to_worker(payload: dict, url: str, token: str, timeout: int = 30) -> None:
    """
    Отправка списка пар в Worker бота (POST JSON с Bearer-токеном).
    Адрес и токен НИКОГДА не выводятся в логи или исключения.
    """
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
        },
    )
    with urllib.request.urlopen(request, timeout=timeout):
        pass


def fetch_ical_content(url: str, timeout: int = 30, retries: int = 3, backoff_seconds: float = 2.0) -> str:
    """
    Безопасная загрузка iCal с User-Agent, таймаутом и повторными попытками.
    Ссылка на календарь НИКОГДА не выводится в логи или исключения.
    """
    headers = {
        "User-Agent": "Mozilla/5.0 (compatible; DSTUScheduleBot/1.0; +https://github.com/ekwsod/DONSTU_ICAL_URL)"
    }
    request = urllib.request.Request(url, headers=headers)

    last_error: Exception | None = None
    for attempt in range(1, retries + 1):
        try:
            print(f"[ИНФО] Попытка загрузки календаря ({attempt}/{retries})...")
            with urllib.request.urlopen(request, timeout=timeout) as response:
                status = getattr(response, "status", 200)
                if status != 200:
                    raise urllib.error.HTTPError(
                        url="[HIDDEN]", code=status, msg=f"HTTP status {status}", hdrs=response.headers, fp=None
                    )
                content = response.read().decode("utf-8", errors="replace")
                print(f"[OK] Календарь успешно загружен ({len(content)} символов).")
                return content
        except Exception as e:
            last_error = e
            error_type = type(e).__name__
            print(f"[ПРЕДУПРЕЖДЕНИЕ] Попытка {attempt} завершилась ошибкой: {error_type}")
            if attempt < retries:
                time.sleep(backoff_seconds * attempt)

    raise RuntimeError(f"Не удалось загрузить календарь после {retries} попыток.") from last_error


def generate_schedule_payload(events: list[ICalEvent], today_date: date, config: Config) -> dict:
    """Генерация полной структуры JSON для публикации на GitHub Pages."""
    today_schedule = calculate_day_schedule(events, today_date, config)
    tomorrow_date = today_date + timedelta(days=1)
    tomorrow_schedule = calculate_day_schedule(events, tomorrow_date, config)

    now_msk = datetime.now(ZoneInfo(config.timezone_name))

    payload = {
        "generated_at": now_msk.isoformat(),
        "for_date": today_schedule["for_date"],
        "has_lessons": today_schedule["has_lessons"],
        "first_lesson": today_schedule["first_lesson"],
        "first_title": today_schedule["first_title"],
        "first_room": today_schedule["first_room"],
        "lessons_count": today_schedule["lessons_count"],
        "alarm_slot": today_schedule["alarm_slot"],
        "all_slots": today_schedule["all_slots"],
        "warning": today_schedule["warning"],
        "notification": today_schedule["notification"],
        "tomorrow": tomorrow_schedule,
    }
    return payload


def main() -> None:
    parser = argparse.ArgumentParser(description="Расчёт будильника по iCal расписанию")
    parser.add_argument("--file", help="Путь к локальному файлу .ics вместо скачивания по сети")
    parser.add_argument("--today", help="Переопределить текущую дату (формат YYYY-MM-DD)")
    parser.add_argument("--output", default="public/schedule.json", help="Путь для сохранения JSON")
    parser.add_argument("--config", default=None, help="Путь к файлу config.json")

    args = parser.parse_args()

    # 1. Загрузка конфигурации
    config = Config.load(args.config)
    print(f"[OK] Конфигурация: подгруппа={config.subgroup}, подготовка={config.prep_minutes} мин, слоты={config.slots}")

    # 2. Получение содержимого календаря
    if args.file:
        file_path = Path(args.file)
        if not file_path.is_file():
            print(f"[ОШИБКА] Файл не найден: {file_path}", file=sys.stderr)
            sys.exit(1)
        with open(file_path, "r", encoding="utf-8") as f:
            ical_text = f.read()
    else:
        ical_url = os.environ.get("DONSTU_ICAL_URL")
        if not ical_url or not ical_url.strip():
            print("[ОШИБКА] Переменная окружения DONSTU_ICAL_URL не задана.", file=sys.stderr)
            sys.exit(1)
        try:
            ical_text = fetch_ical_content(ical_url.strip())
        except Exception as e:
            print(f"[ОШИБКА] Сбой загрузки календаря: {e}", file=sys.stderr)
            sys.exit(1)

    # 3. Парсинг календаря
    try:
        events = parse_ical(ical_text, tz_name=config.timezone_name)
    except Exception as e:
        print(f"[ОШИБКА] Сбой парсинга iCalendar: {e}", file=sys.stderr)
        sys.exit(1)

    if not events:
        print("[ОШИБКА] В календаре 0 событий. Отмена публикации расписания.", file=sys.stderr)
        sys.exit(1)

    print(f"[OK] Распознано событий в календаре: {len(events)}")

    # 4. Определение рабочей даты (сегодня по Москве)
    if args.today:
        today_date = date.fromisoformat(args.today)
    else:
        today_date = datetime.now(ZoneInfo(config.timezone_name)).date()

    # 5. Расчёт расписания
    payload = generate_schedule_payload(events, today_date, config)

    # Вывод безопасного резюме в лог (БЕЗ названий предметов и номеров комнат)
    if payload["has_lessons"]:
        print(f"[OK] Сегодня ({payload['for_date']}): пар={payload['lessons_count']}, первая={payload['first_lesson']}, будильник={payload['alarm_slot']}")
    else:
        print(f"[OK] Сегодня ({payload['for_date']}): пар нет, будильник выключен")

    tom = payload["tomorrow"]
    if tom["has_lessons"]:
        print(f"[OK] Завтра ({tom['for_date']}): пар={tom['lessons_count']}, первая={tom['first_lesson']}, будильник={tom['alarm_slot']}")
    else:
        print(f"[OK] Завтра ({tom['for_date']}): пар нет, будильник выключен")

    # 6. Сохранение результата
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    print(f"[OK] Файл расписания успешно сохранён: {output_path}")

    # 7. Отправка пар боту (только если задан адрес Worker; ошибка не отменяет будильники)
    push_url = os.environ.get("BOT_PUSH_URL", "").strip()
    if push_url:
        lessons = build_lessons_payload(events, today_date, config.lessons_horizon_days, config)
        try:
            push_to_worker(lessons, push_url, os.environ.get("BOT_PUSH_TOKEN", "").strip())
            print(f"[OK] Пары отправлены боту: {len(lessons['lessons'])} шт. на {config.lessons_horizon_days} дн.")
        except Exception as e:
            print(f"[ПРЕДУПРЕЖДЕНИЕ] Не удалось отправить пары боту: {type(e).__name__}", file=sys.stderr)


if __name__ == "__main__":
    main()
