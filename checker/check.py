"""จุดเข้าของตัวเช็ก: โหลด alerts.json → ดึงราคา → ประเมิน → push → บันทึก"""
from __future__ import annotations

import copy
import json
import os
from datetime import datetime, timezone
from pathlib import Path

from . import hours, rules


def run(data: dict, now: datetime, get_price, send) -> dict:
    out = copy.deepcopy(data)
    out.setdefault("push", [])
    out.setdefault("symbols", [])

    prices: dict[str, float] = {}
    for symbol in rules.active_symbols(out, hours.open_markets(now)):
        price = get_price(symbol)
        if price is not None:
            prices[symbol] = price

    evaluated, fired = rules.evaluate(out, prices, now.strftime("%Y-%m-%dT%H:%M:%SZ"))
    # ตัดสินทีละ alert: เส้นที่ไม่มี push ถึงมือสักเครื่องต้องกลับเป็น active เพื่อลองรอบถัดไป
    devices = evaluated.setdefault("push", [])
    kept = 0
    for f in fired:
        body = rules.payload(f)
        delivered = 0
        for sub in devices:
            if sub.get("ok", True) is False:
                continue
            result = send(sub, body)
            if result == "ok":
                delivered += 1
            elif result == "gone":
                sub["ok"] = False
        if delivered:
            kept += 1
        else:
            rules.revert(evaluated, f)
    if fired and kept < len(fired):
        print(f"  ยิง {len(fired)} รายการ ส่ง noti สำเร็จ {kept} — ที่เหลือคงสถานะ active ไว้ลองรอบถัดไป")
    out = evaluated

    out["heartbeat"] = now.strftime("%Y-%m-%d")
    return out


def load(path: Path) -> dict:
    # utf-8-sig: ทนไฟล์ที่มี BOM จาก editor บน Windows (เขียนกลับเป็น utf-8 ปกติ)
    return json.loads(path.read_text(encoding="utf-8-sig"))


def main() -> None:
    from . import prices as price_source
    from . import push

    from .annotate import notice

    path = Path(os.environ.get("DATA_FILE", "data/alerts.json"))
    data = load(path)
    now = datetime.now(timezone.utc)

    # จดผลไว้รายงานเป็น annotation (อ่านได้โดยไม่ต้องลงชื่อเข้าใช้)
    got: dict[str, float | None] = {}
    sends: list[str] = []

    def get_price(sym):
        got[sym] = price_source.last_price(sym)
        return got[sym]

    def send(sub, payload):
        r = push.send(sub, payload)
        sends.append(r)
        return r

    out = run(data, now, get_price, send)
    markets = ",".join(sorted(hours.open_markets(now))) or "none"
    priced = " ".join(f"{s}={'FAIL' if p is None else round(p, 2)}" for s, p in got.items()) or "-"
    notice("check", f"markets={markets} prices: {priced} | pushes: {','.join(sends) or '-'}")
    if out != data:
        path.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print("อัปเดต alerts.json")
    else:
        print("ไม่มีการเปลี่ยนแปลง")


if __name__ == "__main__":
    main()
