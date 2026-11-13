"""ช่วงเวลาที่ตัวเช็กถือว่าตลาดเปิด (pure)

ชั่วโมง UTC รวมปลาย จันทร์–ศุกร์ตาม UTC — ต้องตรงกับ WINDOWS ใน web/logic.js
"""
from __future__ import annotations

from datetime import datetime

TH_SUFFIX = ".BK"
WINDOWS = {"TH": (3, 9), "US": (13, 21)}


def market_of(symbol: str) -> str:
    return "TH" if str(symbol).upper().strip().endswith(TH_SUFFIX) else "US"


def open_markets(now: datetime) -> set[str]:
    if now.weekday() >= 5:
        return set()
    return {m for m, (start, end) in WINDOWS.items() if start <= now.hour <= end}
