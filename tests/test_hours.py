from datetime import datetime, timezone

from checker import hours


def at(iso: str) -> datetime:
    return datetime.fromisoformat(iso).replace(tzinfo=timezone.utc)


def test_market_of():
    assert hours.market_of("PTT.BK") == "TH"
    assert hours.market_of(" ptt.bk ") == "TH"
    assert hours.market_of("NVDA") == "US"


def test_open_markets_windows():
    # 2026-11-13 เป็นวันศุกร์
    assert hours.open_markets(at("2026-11-13T02:59:00")) == set()
    assert hours.open_markets(at("2026-11-13T03:00:00")) == {"TH"}
    assert hours.open_markets(at("2026-11-13T09:59:00")) == {"TH"}
    assert hours.open_markets(at("2026-11-13T10:00:00")) == set()
    assert hours.open_markets(at("2026-11-13T13:00:00")) == {"US"}
    assert hours.open_markets(at("2026-11-13T21:59:00")) == {"US"}
    assert hours.open_markets(at("2026-11-13T22:00:00")) == set()


def test_open_markets_weekend():
    assert hours.open_markets(at("2026-11-14T05:00:00")) == set()  # เสาร์
    assert hours.open_markets(at("2026-11-15T15:00:00")) == set()  # อาทิตย์
