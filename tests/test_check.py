import copy
from datetime import datetime, timezone

from checker import check

NOW = datetime(2026, 11, 13, 15, 45, tzinfo=timezone.utc)  # ศุกร์ ตลาดสหรัฐเปิด
NOW_ISO = "2026-11-13T15:45:00Z"


def sub(n, ok=True):
    return {"endpoint": f"https://push.example/{n}", "keys": {"p256dh": "p", "auth": "a"}, "ok": ok}


def data(push=None):
    return {
        "version": 1,
        "heartbeat": "2026-11-13",
        "push": push if push is not None else [sub(1)],
        "symbols": [
            {"symbol": "NVDA", "sl": {"price": 178, "status": "active"}, "tp": None, "alerts": []},
            {"symbol": "PTT.BK", "sl": {"price": 31.5, "status": "active"}, "tp": None, "alerts": []},
            {"symbol": "MSFT", "sl": None, "tp": None, "alerts": []},
        ],
    }


class Recorder:
    """results: endpoint -> result, หรือ endpoint -> list ผลตามลำดับการเรียก (ตัวสุดท้ายใช้ซ้ำ)"""

    def __init__(self, results=None):
        self.results = results or {}
        self.sent = []
        self.calls = {}

    def __call__(self, s, payload):
        ep = s["endpoint"]
        self.sent.append((ep, payload))
        n = self.calls.get(ep, 0)
        self.calls[ep] = n + 1
        r = self.results.get(ep, "ok")
        if isinstance(r, list):
            return r[min(n, len(r) - 1)]
        return r


def two_us_data(push):
    d = data(push)
    d["symbols"][2] = {"symbol": "AAPL", "sl": {"price": 200, "status": "active"}, "tp": None, "alerts": []}
    del d["symbols"][1]  # PTT.BK ออก เหลือ NVDA, AAPL
    return d


def prices(sym):
    return {"NVDA": 177.6, "AAPL": 199.0}[sym]


def test_only_fetches_open_market_symbols_with_active_lines():
    asked = []

    def get_price(sym):
        asked.append(sym)
        return 190.0

    out = check.run(data(), NOW, get_price, Recorder())
    assert asked == ["NVDA"]
    assert out == data()


def test_fires_pushes_and_marks_fired():
    send = Recorder()
    d = data()
    before = copy.deepcopy(d)
    out = check.run(d, NOW, lambda s: 177.6, send)
    assert d == before
    assert send.sent == [(
        "https://push.example/1",
        {"title": "NVDA แตะ SL 178.00 (ล่าสุด 177.60)", "body": "แตะเพื่อเปิดกราฟ", "url": "/#/s/NVDA"},
    )]
    assert out["symbols"][0]["sl"] == {
        "price": 178, "status": "fired", "fired_at": NOW_ISO, "fired_price": 177.6,
    }


def test_skips_devices_marked_not_ok():
    send = Recorder()
    check.run(data([sub(1, ok=False), sub(2)]), NOW, lambda s: 177.6, send)
    assert [e for e, _ in send.sent] == ["https://push.example/2"]


def test_keeps_alert_active_when_nothing_was_delivered():
    out = check.run(data(), NOW, lambda s: 177.6, Recorder({"https://push.example/1": "error"}))
    assert out["symbols"][0]["sl"] == {"price": 178, "status": "active"}
    assert out["push"][0]["ok"] is True


def test_gone_device_is_disabled_and_alert_stays_active_if_it_was_the_only_one():
    out = check.run(data(), NOW, lambda s: 177.6, Recorder({"https://push.example/1": "gone"}))
    assert out["push"][0]["ok"] is False
    assert out["symbols"][0]["sl"]["status"] == "active"


def test_one_delivery_is_enough_and_gone_device_still_disabled():
    send = Recorder({"https://push.example/1": "gone"})
    out = check.run(data([sub(1), sub(2)]), NOW, lambda s: 177.6, send)
    assert [p["ok"] for p in out["push"]] == [False, True]
    assert out["symbols"][0]["sl"]["status"] == "fired"


def test_no_devices_keeps_alert_active():
    out = check.run(data([]), NOW, lambda s: 177.6, Recorder())
    assert out["symbols"][0]["sl"]["status"] == "active"


def test_price_failure_skips_symbol():
    out = check.run(data(), NOW, lambda s: None, Recorder())
    assert out == data()


def test_heartbeat_updates_once_per_day_even_when_markets_closed():
    d = data()
    d["heartbeat"] = "2026-11-12"
    sunday = datetime(2026, 11, 15, 15, 0, tzinfo=timezone.utc)
    asked = []
    out = check.run(d, sunday, lambda s: asked.append(s), Recorder())
    assert asked == []
    assert out["heartbeat"] == "2026-11-15"


def test_delivery_is_decided_per_alert():
    send = Recorder({"https://push.example/1": ["ok", "error"]})
    out = check.run(two_us_data([sub(1)]), NOW, prices, send)
    assert out["symbols"][0]["sl"] == {
        "price": 178, "status": "fired", "fired_at": NOW_ISO, "fired_price": 177.6,
    }
    assert out["symbols"][1]["sl"] == {"price": 200, "status": "active"}
    assert out["push"][0]["ok"] is True


def test_gone_device_not_resent_and_second_device_covers_both_alerts():
    send = Recorder({"https://push.example/1": "gone"})
    out = check.run(two_us_data([sub(1), sub(2)]), NOW, prices, send)
    assert out["push"][0]["ok"] is False
    assert out["push"][1]["ok"] is True
    assert send.calls["https://push.example/1"] == 1
    assert out["symbols"][0]["sl"]["status"] == "fired"
    assert out["symbols"][1]["sl"]["status"] == "fired"


def test_only_device_gone_on_first_send_keeps_both_active_and_is_not_resent():
    send = Recorder({"https://push.example/1": "gone"})
    out = check.run(two_us_data([sub(1)]), NOW, prices, send)
    assert out["push"][0]["ok"] is False
    assert out["symbols"][0]["sl"] == {"price": 178, "status": "active"}
    assert out["symbols"][1]["sl"] == {"price": 200, "status": "active"}
    assert send.calls["https://push.example/1"] == 1


def test_load_accepts_utf8_bom(tmp_path):
    p = tmp_path / "alerts.json"
    p.write_bytes(b"\xef\xbb\xbf" + '{"version":1,"symbols":[{"symbol":"ปตท"}]}'.encode("utf-8"))
    assert check.load(p)["symbols"][0]["symbol"] == "ปตท"

def test_keeps_fibos_marks_and_unknown_keys():
    d = data()
    d["symbols"][0]["fibos"] = [{"id": "f1", "t1": "2026-03-12", "p1": 142.3, "t2": "2026-07-08", "p2": 176.85}]
    d["symbols"][0]["marks"] = [{"id": "m1", "t": "2026-03-12", "kind": "buy", "note": "ซื้อ"}]
    d["extra"] = {"keep": True}
    out = check.run(d, NOW, lambda sym: 177.6, lambda sub, payload: "ok")
    assert out["symbols"][0]["fibos"] == d["symbols"][0]["fibos"]
    assert out["symbols"][0]["marks"] == d["symbols"][0]["marks"]
    assert out["extra"] == {"keep": True}
