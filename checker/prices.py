"""ราคาล่าสุดจาก Yahoo Finance ผ่าน yfinance (ช้า ~15 นาที)"""
from __future__ import annotations


def last_price(symbol: str) -> float | None:
    try:
        import yfinance as yf

        price = yf.Ticker(symbol).fast_info["last_price"]
        price = float(price)
        return price if price > 0 else None
    except Exception as e:  # network / symbol error → ข้ามตัวนี้
        from .annotate import warning

        print(f"  [price] {symbol} ล้มเหลว: {type(e).__name__}")
        warning("price", f"{symbol}: {type(e).__name__}: {e}")
        return None
