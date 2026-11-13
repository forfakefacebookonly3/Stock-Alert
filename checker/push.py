"""ส่ง Web Push ด้วย pywebpush — ห้ามพิมพ์ endpoint หรือ key ลง log
โหมด dry-run ต้องเปิดเองด้วย DRY_RUN=1 เท่านั้น; ถ้าไม่ได้ตั้ง VAPID_PRIVATE_KEY จะคืน "error" (alert คง active)"""
from __future__ import annotations

import json
import os


def send(sub: dict, payload: dict) -> str:
    """คืน "ok" | "gone" (404/410 ปลายทางหมดอายุ) | "error"
    DRY_RUN=1 → พิมพ์ title แล้วคืน "ok" โดยไม่ส่งจริง; ไม่มี VAPID_PRIVATE_KEY (หรือว่าง) → "error" """
    if os.environ.get("DRY_RUN") == "1":
        print(f"  [push:dry-run] {payload['title']}")
        return "ok"
    private_key = os.environ.get("VAPID_PRIVATE_KEY")
    if not private_key:
        print("  [push] ไม่ได้ตั้ง VAPID_PRIVATE_KEY — ไม่ได้ส่ง noti")
        return "error"
    try:
        from pywebpush import WebPushException, webpush
    except Exception as e:
        print(f"  [push] โหลด pywebpush ไม่ได้: {type(e).__name__}")
        return "error"
    try:
        webpush(
            subscription_info={"endpoint": sub["endpoint"], "keys": sub["keys"]},
            data=json.dumps(payload, ensure_ascii=False),
            vapid_private_key=private_key,
            vapid_claims={"sub": os.environ.get("VAPID_SUBJECT", "mailto:alert@example.com")},
            ttl=86400,
            headers={"Urgency": "high"},
            timeout=10,
        )
        return "ok"
    except WebPushException as e:
        status = getattr(getattr(e, "response", None), "status_code", None)
        if status in (404, 410):
            return "gone"
        print(f"  [push] ส่งไม่สำเร็จ (HTTP {status})")
        return "error"
    except Exception as e:
        print(f"  [push] ส่งไม่สำเร็จ: {type(e).__name__}")
        return "error"
