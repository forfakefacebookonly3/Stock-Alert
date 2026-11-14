"""โหมดตรวจระบบบน GitHub Actions: ดึงราคาทุกหุ้นในรายการโดยไม่สนเวลาตลาด และส่ง noti ทดสอบ
ไม่แก้ alerts.json ผลออกเป็น annotation ที่อ่านได้โดยไม่ต้องลงชื่อเข้าใช้

รัน: python -m checker.diag (ตั้ง DATA_FILE, VAPID_PRIVATE_KEY, VAPID_SUBJECT)"""
from __future__ import annotations

import os
from pathlib import Path

from . import prices, push
from .annotate import notice
from .check import load


def main() -> None:
    data = load(Path(os.environ.get("DATA_FILE", "data/alerts.json")))
    got = {s["symbol"]: prices.last_price(s["symbol"]) for s in data.get("symbols", [])}
    priced = " ".join(f"{s}={'FAIL' if p is None else round(p, 2)}" for s, p in got.items()) or "-"
    notice("diag prices", priced)

    payload = {"title": "ทดสอบจากตัวเช็กราคา (GitHub)", "body": "ถ้าเห็นข้อความนี้ การส่ง noti จากตัวเช็กใช้ได้", "url": "/"}
    results = [push.send(sub, payload) for sub in data.get("push", []) if sub.get("ok", True) is not False]
    notice("diag push", f"devices={len(results)} results={','.join(results) or '-'}")


if __name__ == "__main__":
    main()
