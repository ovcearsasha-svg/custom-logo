"""Build-time PNG -> straight RGBA. Only Python stdlib; no decoder on MGU.

Input contract: static, non-interlaced RGBA8 PNG, <=2048x2048, <=8 MiB.
CRC, chunk ordering, decompression bounds and all five filters are checked.
"""
from pathlib import Path
import json
import struct
import zlib
import base64

ROOT = Path(__file__).resolve().parents[1]


def decode_png(data):
    if len(data) > 8 * 1048576 or data[:8] != b'\x89PNG\r\n\x1a\n':
        raise ValueError('Expected PNG <=8 MiB')
    pos, header, ended, idat_ended = 8, None, False, False
    chunks = []
    while pos < len(data):
        if pos + 12 > len(data):
            raise ValueError('Truncated chunk')
        size = struct.unpack_from('>I', data, pos)[0]
        kind = data[pos + 4:pos + 8]
        end = pos + 12 + size
        if end > len(data):
            raise ValueError('Truncated chunk data')
        body = data[pos + 8:pos + 8 + size]
        if zlib.crc32(kind + body) & 0xffffffff != struct.unpack_from('>I', data, end - 4)[0]:
            raise ValueError('PNG CRC mismatch')
        if header is None and kind != b'IHDR':
            raise ValueError('IHDR must be first')
        if kind == b'IHDR':
            if header is not None or size != 13:
                raise ValueError('Invalid IHDR')
            header = struct.unpack('>IIBBBBB', body)
            w, h, depth, color, compression, filtering, interlace = header
            if not (1 <= w <= 2048 and 1 <= h <= 2048):
                raise ValueError('PNG must be <=2048x2048')
            if (depth, color, compression, filtering, interlace) != (8, 6, 0, 0, 0):
                raise ValueError('Export as non-interlaced RGBA8 PNG')
        elif kind == b'IDAT':
            if idat_ended:
                raise ValueError('Non-consecutive IDAT')
            chunks.append(body)
        elif kind == b'IEND':
            if size or not chunks or end != len(data):
                raise ValueError('Invalid IEND or trailing data')
            ended = True
            break
        elif kind in (b'acTL', b'fcTL', b'fdAT'):
            raise ValueError('Animated PNG is not supported')
        elif kind == b'PLTE':
            if chunks or size == 0 or size % 3 or size > 768:
                raise ValueError('Invalid palette')
        elif kind[0] & 32 == 0:
            raise ValueError('Unsupported critical chunk')
        if chunks and kind != b'IDAT':
            idat_ended = True
        pos = end
    if not ended:
        raise ValueError('Missing IEND')
    expected = h * (w * 4 + 1)
    inflater = zlib.decompressobj()
    raw = inflater.decompress(b''.join(chunks), expected + 1)
    if len(raw) != expected or not inflater.eof or inflater.unused_data or inflater.unconsumed_tail:
        raise ValueError('Invalid or oversized decompressed pixels')
    stride = w * 4
    result = bytearray(h * stride)
    for y in range(h):
        offset = y * (stride + 1)
        method = raw[offset]
        if method > 4:
            raise ValueError('Invalid PNG filter')
        if method == 0:
            result[y * stride:(y + 1) * stride] = raw[offset + 1:offset + 1 + stride]
            continue
        for x in range(stride):
            index = y * stride + x
            a = result[index - 4] if x >= 4 else 0
            b = result[index - stride] if y else 0
            c = result[index - stride - 4] if y and x >= 4 else 0
            if method == 1:
                prediction = a
            elif method == 2:
                prediction = b
            elif method == 3:
                prediction = (a + b) // 2
            else:
                p = a + b - c
                pa, pb, pc = abs(p-a), abs(p-b), abs(p-c)
                prediction = a if pa <= pb and pa <= pc else b if pb <= pc else c
            result[index] = (raw[offset + 1 + x] + prediction) & 255
    if not any(a < 255 for a in result[3::4]) or not any(a > 0 for a in result[3::4]):
        raise ValueError('Logo must have both visible pixels and transparency')
    return w, h, bytes(result)


def display_texture(w, h, rgba):
    """Bound the display texture, retaining the whole source canvas and aspect.

    Alpha-weighted area averaging avoids fringes at transparent edges.
    This creates display data only: assets/logo.png is never written here.
    """
    scale = min(1, 512 / w, 512 / h)
    dw, dh = max(1, round(w * scale)), max(1, round(h * scale))
    if (dw, dh) == (w, h):
        return w, h, rgba
    out = bytearray(dw * dh * 4)
    for y in range(dh):
        y0, y1 = y * h // dh, (y + 1) * h // dh
        for x in range(dw):
            x0, x1 = x * w // dw, (x + 1) * w // dw
            red = green = blue = alpha = 0
            for sy in range(y0, y1):
                for sx in range(x0, x1):
                    i = (sy * w + sx) * 4
                    a = rgba[i + 3]
                    alpha += a
                    red += rgba[i] * a
                    green += rgba[i + 1] * a
                    blue += rgba[i + 2] * a
            i = (y * dw + x) * 4
            if alpha:
                out[i:i+4] = bytes((round(red/alpha), round(green/alpha), round(blue/alpha),
                                     round(alpha / ((x1-x0)*(y1-y0)))))
    return dw, dh, bytes(out)


def prepare(root=ROOT):
    root = Path(root)
    w, h, rgba = decode_png((root / 'assets/logo.png').read_bytes())
    w, h, rgba = display_texture(w, h, rgba)
    config = json.loads((root / 'config.json').read_text(encoding='utf-8'))
    if set(config) != {'enabled', 'x', 'y', 'width', 'height'}:
        raise ValueError('Unknown or missing config keys')
    if type(config['enabled']) is not bool or any(type(config[k]) is not int for k in ('x', 'y', 'width', 'height')):
        raise ValueError('Invalid config types')
    if not (32 <= config['width'] <= 512 and 32 <= config['height'] <= 512 and
            -config['width'] < config['x'] < 1920 and -config['height'] < config['y'] < 720):
        raise ValueError('Invalid panel rectangle')
    app = root / 'apps/custom_logo'
    payload = base64.b64encode(zlib.compress(rgba, 9)).decode('ascii')
    (app / 'logo-data.js').write_text(
        "'use strict';\n// Generated by tools/prepare.py; straight alpha.\nmodule.exports = { width: %d, height: %d, rgba: require('zlib').inflateSync(Buffer.from('%s', 'base64')) };\n" % (w, h, payload), encoding='utf-8')
    (app / 'logo-config.js').write_text("'use strict';\nmodule.exports = " + json.dumps(config) + ';\n', encoding='utf-8')
    return w, h


if __name__ == '__main__':
    print('Prepared %dx%d PNG' % prepare())
