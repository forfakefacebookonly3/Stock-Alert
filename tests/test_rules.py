import copy

from checker import rules

NOW = "2026-11-13T15:45:00Z"


def data():
    return {
        "version": 1,
        "heartbeat": None,
        "push": [],
        "symbols": [
            {
                "symbol": "NVDA",
                "sl": {"price": 178, "status": "active"},
                "tp": {"price": 210, "status": "active"},
                "alerts": [
                    {"id": "a1", "price": 200, "dir": "above", "status": "active"},
                    {"id": "a2", "price": 185, "dir": "below", "status": "active"},
                ],
            },
            {"symbol": "PTT.BK", "sl": {"price": 31.5, "status": "active"}, "tp": None, "alerts": []},
            {"symbol": "MSFT", "sl": None, "tp": None, "alerts": []},
            {"symbol": "SAV.BK", "sl": {"price": 10, "status": "fired"}, "tp": None, "alerts": []},
        ],
    }


def test_active_symbols_filters_by_market_and_active_lines():
    d = data()
    assert rules.active_symbols(d, {"US"}) == ["NVDA"]
    assert rules.active_symbols(d, {"TH"}) == ["PTT.BK"]
    assert rules.active_symbols(d, {"US", "TH"}) == ["NVDA", "PTT.BK"]
    assert rules.active_symbols(d, set()) == []


def test_nothing_fires_between_levels():
    d = data()
    out, fired = rules.evaluate(d, {"NVDA": 190.0}, NOW)
    assert fired == []
    assert out == d


def test_sl_fires_at_and_below_level():
    for last in (178.0, 177.6):
        out, fired = rules.evaluate(data(), {"NVDA": last}, NOW)
        kinds = [f["kind"] for f in fired]
        assert kinds == ["sl", "below"]  # 185 below ก็ถึงด้วย
        assert out["symbols"][0]["sl"] == {
            "price": 178, "status": "fired", "fired_at": NOW, "fired_price": last,
        }
        assert out["symbols"][0]["tp"]["status"] == "active"


def test_tp_and_above_alert_fire_at_and_over_level():
    out, fired = rules.evaluate(data(), {"NVDA": 210.0}, NOW)
    assert [f["kind"] for f in fired] == ["tp", "above"]
    assert fired[0] == {"symbol": "NVDA", "kind": "tp", "ref": "tp", "price": 210, "last": 210.0}
    assert out["symbols"][0]["alerts"][0]["status"] == "fired"
    assert out["symbols"][0]["alerts"][0]["fired_price"] == 210.0
    assert out["symbols"][0]["alerts"][1]["status"] == "active"


def test_above_alert_alone():
    out, fired = rules.evaluate(data(), {"NVDA": 200.0}, NOW)
    assert fired == [{"symbol": "NVDA", "kind": "above", "ref": "a1", "price": 200, "last": 200.0}]


def test_fired_lines_do_not_fire_again():
    out, fired = rules.evaluate(data(), {"SAV.BK": 5.0}, NOW)
    assert fired == []


def test_symbol_without_price_is_untouched_and_input_not_mutated():
    d = data()
    before = copy.deepcopy(d)
    out, fired = rules.evaluate(d, {"PTT.BK": 31.0}, NOW)
    assert d == before
    assert [f["symbol"] for f in fired] == ["PTT.BK"]
    assert out["symbols"][0] == before["symbols"][0]


def test_messages():
    assert rules.message({"symbol": "NVDA", "kind": "sl", "price": 178, "last": 177.6}) == "NVDA แตะ SL 178.00 (ล่าสุด 177.60)"
    assert rules.message({"symbol": "NVDA", "kind": "tp", "price": 210, "last": 210.4}) == "NVDA แตะ TP 210.00 (ล่าสุด 210.40)"
    assert rules.message({"symbol": "PTT.BK", "kind": "above", "price": 33, "last": 33.25}) == "PTT ขึ้นถึง 33.00 (ล่าสุด 33.25)"
    assert rules.message({"symbol": "PTT.BK", "kind": "below", "price": 31.5, "last": 31.25}) == "PTT ลงถึง 31.50 (ล่าสุด 31.25)"


def test_payload():
    p = rules.payload({"symbol": "PTT.BK", "kind": "sl", "price": 31.5, "last": 31.25})
    assert p == {"title": "PTT แตะ SL 31.50 (ล่าสุด 31.25)", "body": "แตะเพื่อเปิดกราฟ", "url": "/#/s/PTT.BK"}


def test_fired_items_carry_ref_to_the_line():
    out, fired = rules.evaluate(data(), {"NVDA": 177.6}, NOW)
    assert [(f["kind"], f["ref"]) for f in fired] == [("sl", "sl"), ("below", "a2")]


def test_revert_sl_restores_active_and_leaves_others():
    out, fired = rules.evaluate(data(), {"NVDA": 177.6}, NOW)
    sl = next(f for f in fired if f["ref"] == "sl")
    rules.revert(out, sl)
    assert out["symbols"][0]["sl"] == {"price": 178, "status": "active"}
    assert out["symbols"][0]["alerts"][1]["status"] == "fired"


def test_revert_alert_by_id_restores_original_dict():
    out, fired = rules.evaluate(data(), {"NVDA": 200.0}, NOW)
    a1 = next(f for f in fired if f["ref"] == "a1")
    rules.revert(out, a1)
    assert out["symbols"][0]["alerts"][0] == {"id": "a1", "price": 200, "dir": "above", "status": "active"}


def test_payload_unchanged_by_ref():
    f = {"symbol": "NVDA", "kind": "sl", "ref": "sl", "price": 178, "last": 177.6}
    assert set(rules.payload(f)) == {"title", "body", "url"}
