"""กติกาการยิง alert (pure — ไม่มี I/O)"""
from __future__ import annotations

import copy

from .hours import TH_SUFFIX, market_of

LABELS = {"sl": "แตะ SL", "tp": "แตะ TP", "above": "ขึ้นถึง", "below": "ลงถึง"}


def _is_active(line: dict | None) -> bool:
    return bool(line) and line.get("status") == "active"


def active_symbols(data: dict, markets: set[str]) -> list[str]:
    """หุ้นของตลาดที่เปิดอยู่ ที่มีเส้น active อย่างน้อย 1 เส้น"""
    out = []
    for s in data.get("symbols", []):
        if market_of(s["symbol"]) not in markets:
            continue
        lines = [s.get("sl"), s.get("tp"), *s.get("alerts", [])]
        if any(_is_active(line) for line in lines):
            out.append(s["symbol"])
    return out


def _hit(kind: str, price: float, last: float) -> bool:
    return last <= price if kind in ("sl", "below") else last >= price


def evaluate(data: dict, prices: dict[str, float], now_iso: str) -> tuple[dict, list[dict]]:
    """คืน (ข้อมูลใหม่ที่ทำเครื่องหมาย fired แล้ว, รายการที่ยิง) — ไม่แก้ data ที่ส่งเข้า"""
    out = copy.deepcopy(data)
    fired: list[dict] = []
    for s in out.get("symbols", []):
        last = prices.get(s["symbol"])
        if last is None:
            continue
        targets = [("sl", "sl", s.get("sl")), ("tp", "tp", s.get("tp"))]
        targets += [(a["dir"], a["id"], a) for a in s.get("alerts", [])]
        for kind, ref, line in targets:
            if _is_active(line) and _hit(kind, line["price"], last):
                line["status"] = "fired"
                line["fired_at"] = now_iso
                line["fired_price"] = last
                fired.append({"symbol": s["symbol"], "kind": kind, "ref": ref, "price": line["price"], "last": last})
    return out, fired


def revert(data: dict, fired_item: dict) -> None:
    """คืนเส้นที่ยิงแล้วให้เป็น active (แก้ data ในที่ — ใช้กับสำเนาที่ evaluate คืนมา)
    ลบ fired_at / fired_price ตาม fired_item["ref"] ("sl" | "tp" | id ของ alert)"""
    for s in data.get("symbols", []):
        if s["symbol"] != fired_item["symbol"]:
            continue
        ref = fired_item["ref"]
        if ref in ("sl", "tp"):
            lines = [s.get(ref)]
        else:
            lines = [a for a in s.get("alerts", []) if a.get("id") == ref]
        for line in lines:
            if line:
                line.pop("fired_at", None)
                line.pop("fired_price", None)
                line["status"] = "active"


def _display(symbol: str) -> str:
    s = str(symbol).upper().strip()
    return s[: -len(TH_SUFFIX)] if s.endswith(TH_SUFFIX) else s


def message(fired: dict) -> str:
    return (
        f"{_display(fired['symbol'])} {LABELS[fired['kind']]} "
        f"{fired['price']:.2f} (ล่าสุด {fired['last']:.2f})"
    )


def payload(fired: dict) -> dict:
    return {"title": message(fired), "body": "แตะเพื่อเปิดกราฟ", "url": f"/#/s/{fired['symbol']}"}
