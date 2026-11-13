"""สร้างไอคอน PWA (PNG) ด้วย stdlib ล้วน: พื้นเข้ม + แท่งเทียน 3 แท่ง"""
import struct
import sys
import zlib
from pathlib import Path

BG = (11, 17, 24)
GREEN = (38, 166, 154)
RED = (239, 83, 80)


def png(size: int) -> bytes:
    px = [[BG] * size for _ in range(size)]

    def rect(x0, y0, x1, y1, color):
        for y in range(int(y0 * size), int(y1 * size)):
            for x in range(int(x0 * size), int(x1 * size)):
                px[y][x] = color

    # (กลางแท่ง x, ไส้บน, ตัวบน, ตัวล่าง, ไส้ล่าง, สี)
    candles = [
        (0.30, 0.48, 0.54, 0.72, 0.78, RED),
        (0.50, 0.34, 0.40, 0.62, 0.68, GREEN),
        (0.70, 0.20, 0.26, 0.50, 0.58, GREEN),
    ]
    for cx, wt, bt, bb, wb, color in candles:
        rect(cx - 0.012, wt, cx + 0.012, wb, color)
        rect(cx - 0.07, bt, cx + 0.07, bb, color)

    raw = b"".join(b"\x00" + bytes(c for p in row for c in p) for row in px)

    def chunk(kind: bytes, data: bytes) -> bytes:
        body = kind + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)

    ihdr = struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")


if __name__ == "__main__":
    out = Path(sys.argv[1] if len(sys.argv) > 1 else "web/icons")
    out.mkdir(parents=True, exist_ok=True)
    for size in (192, 512):
        (out / f"icon-{size}.png").write_bytes(png(size))
        print(f"เขียน {out / f'icon-{size}.png'}")
