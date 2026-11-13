"""สร้างไอคอน PWA (PNG) ด้วย stdlib ล้วน

- icon-192/512: พื้นเข้ม + แท่งเทียน 3 แท่งสี (ไอคอนแอป)
- badge-96: แท่งเทียน 3 แท่งสีขาวบนพื้นโปร่งใส (ไอคอนเล็กใน noti — Android ใช้แค่ alpha)
"""
import struct
import sys
import zlib
from pathlib import Path

BG = (11, 17, 24)
GREEN = (38, 166, 154)
RED = (239, 83, 80)


def _chunk(kind: bytes, data: bytes) -> bytes:
    body = kind + data
    return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)


def _png(size: int, color_type: int, rows) -> bytes:
    raw = b"".join(b"\x00" + bytes(c for p in row for c in p) for row in rows)
    ihdr = struct.pack(">IIBBBBB", size, size, 8, color_type, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + _chunk(b"IHDR", ihdr) + _chunk(b"IDAT", zlib.compress(raw, 9)) + _chunk(b"IEND", b"")


def _draw(size, background, candles, wick, body):
    px = [[background] * size for _ in range(size)]

    def rect(x0, y0, x1, y1, color):
        for y in range(int(y0 * size), int(y1 * size)):
            for x in range(int(x0 * size), int(x1 * size)):
                px[y][x] = color

    # (กลางแท่ง x, ไส้บน, ตัวบน, ตัวล่าง, ไส้ล่าง, สี)
    for cx, wt, bt, bb, wb, color in candles:
        rect(cx - wick, wt, cx + wick, wb, color)
        rect(cx - body, bt, cx + body, bb, color)
    return px


def app_png(size: int) -> bytes:
    candles = [
        (0.30, 0.48, 0.54, 0.72, 0.78, RED),
        (0.50, 0.34, 0.40, 0.62, 0.68, GREEN),
        (0.70, 0.20, 0.26, 0.50, 0.58, GREEN),
    ]
    return _png(size, 2, _draw(size, BG, candles, 0.012, 0.07))


def badge_png(size: int) -> bytes:
    white = (255, 255, 255, 255)
    candles = [
        (0.20, 0.46, 0.54, 0.80, 0.90, white),
        (0.50, 0.28, 0.36, 0.66, 0.76, white),
        (0.80, 0.10, 0.18, 0.48, 0.58, white),
    ]
    return _png(size, 6, _draw(size, (0, 0, 0, 0), candles, 0.035, 0.11))


if __name__ == "__main__":
    out = Path(sys.argv[1] if len(sys.argv) > 1 else "web/icons")
    out.mkdir(parents=True, exist_ok=True)
    for size in (192, 512):
        (out / f"icon-{size}.png").write_bytes(app_png(size))
        print(f"เขียน {out / f'icon-{size}.png'}")
    (out / "badge-96.png").write_bytes(badge_png(96))
    print(f"เขียน {out / 'badge-96.png'}")
