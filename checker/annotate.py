"""พิมพ์ annotation ของ GitHub Actions (::notice / ::warning)

annotation อ่านได้จากหน้า run และจาก API โดยไม่ต้องลงชื่อเข้าใช้ (ต่างจาก log) — ใช้รายงานผลตัวเช็ก
ห้ามใส่ endpoint/key ของ push ลงข้อความ"""
from __future__ import annotations


def _clean(text: str) -> str:
    # รูปแบบคำสั่งของ Actions: % \r \n ต้อง escape
    return str(text).replace("%", "%25").replace("\r", "%0D").replace("\n", "%0A")[:500]


def notice(title: str, message: str) -> None:
    print(f"::notice title={_clean(title)}::{_clean(message)}", flush=True)


def warning(title: str, message: str) -> None:
    print(f"::warning title={_clean(title)}::{_clean(message)}", flush=True)
