import importlib.util
import struct
import zlib
from pathlib import Path

spec = importlib.util.spec_from_file_location("make_icons", Path(__file__).parent.parent / "tools" / "make_icons.py")
make_icons = importlib.util.module_from_spec(spec)
spec.loader.exec_module(make_icons)


def decode(png: bytes):
    assert png[:8] == b"\x89PNG\r\n\x1a\n"
    pos, ihdr, idat = 8, None, b""
    while pos < len(png):
        (length,) = struct.unpack(">I", png[pos:pos + 4])
        kind = png[pos + 4:pos + 8]
        body = png[pos + 8:pos + 8 + length]
        if kind == b"IHDR":
            ihdr = struct.unpack(">IIBBBBB", body)
        elif kind == b"IDAT":
            idat += body
        pos += 12 + length
    return ihdr, zlib.decompress(idat)


def pixel(raw: bytes, size: int, channels: int, x: int, y: int):
    row = 1 + size * channels
    start = y * row + 1 + x * channels
    return tuple(raw[start:start + channels])


def test_badge_is_white_on_transparent():
    size = 96
    (w, h, depth, color_type, *_), raw = decode(make_icons.badge_png(size))
    assert (w, h, depth, color_type) == (96, 96, 8, 6)
    assert pixel(raw, size, 4, 0, 0) == (0, 0, 0, 0)
    assert pixel(raw, size, 4, 48, 48) == (255, 255, 255, 255)  # ตัวแท่งกลาง
    alphas = {pixel(raw, size, 4, x, y)[3] for y in range(size) for x in range(size)}
    assert alphas == {0, 255}


def test_app_icon_unchanged_shape():
    (w, h, depth, color_type, *_), _raw = decode(make_icons.app_png(192))
    assert (w, h, depth, color_type) == (192, 192, 8, 2)
