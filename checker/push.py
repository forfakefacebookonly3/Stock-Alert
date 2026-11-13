"""ส่ง Web Push ด้วย pywebpush — ห้ามพิมพ์ endpoint ลง log"""
from __future__ import annotations

import json
import os


def send(sub: dict, payload: dict) -> str:
    """คืน "ok" | "gone" (404/410 ปลายทางหมดอายุ) | "error" """
    private_key = os.environ.get("VAPID_PRIVATE_KEY")
    if not private_key:
        print(f"  [push:dry-run] {payload['title']}")
        return "ok"
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
            ttl=3600,
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
