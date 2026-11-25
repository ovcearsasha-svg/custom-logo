import importlib.util
import json
from pathlib import Path
import struct
import sys
import tempfile
import unittest
import warnings
import zlib

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools'))
from prepare import decode_png, prepare, display_texture


def chunk(kind, body):
    return struct.pack('>I', len(body)) + kind + body + struct.pack('>I', zlib.crc32(kind + body) & 0xffffffff)


def png(raw, w=2, h=2, color=6, extra=b''):
    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, color, 0, 0, 0)) +
            extra + chunk(b'IDAT', zlib.compress(raw)) + chunk(b'IEND', b''))


class PNGTests(unittest.TestCase):
    def test_all_filters_and_straight_alpha(self):
        pixels = bytes([200, 100, 50, 128, 0, 0, 0, 0, 40, 80, 120, 255, 1, 2, 3, 4])
        for method in range(5):
            raw = bytearray()
            for y in range(2):
                raw.append(method)
                for x in range(8):
                    i = y * 8 + x
                    a = pixels[i - 4] if x >= 4 else 0
                    b = pixels[i - 8] if y else 0
                    c = pixels[i - 12] if y and x >= 4 else 0
                    p = a + b - c
                    ds = [abs(p-a), abs(p-b), abs(p-c)]
                    pred = (0, a, b, (a+b)//2, (a,b,c)[ds.index(min(ds))])[method]
                    raw.append((pixels[i] - pred) & 255)
            self.assertEqual(decode_png(png(raw)), (2, 2, pixels))

    def test_corruption_and_limits(self):
        valid = png(bytes([0] * 18))
        bad = [b'no', valid[:-1], valid + b'x', valid[:20] + b'x' + valid[21:],
               png(b'', w=2049), png(b'', color=2), png(bytes(1000000)),
               png(bytes(18), extra=chunk(b'acTL', bytes(8))),
               png(bytes([5] + [0]*8 + [0]*9)), valid,
               png(bytes([0] + [255]*8 + [0] + [255]*8))]
        for data in bad:
            with self.assertRaises((ValueError, zlib.error)):
                decode_png(data)

    def test_source_logo(self):
        w, h, rgba = decode_png((ROOT / 'assets/logo.png').read_bytes())
        self.assertEqual(len(rgba), w * h * 4)

    def test_invalid_config(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / 'assets').mkdir()
            (root / 'assets/logo.png').write_bytes((ROOT / 'assets/logo.png').read_bytes())
            config = json.loads((ROOT / 'config.json').read_text())
            config['x'] = 1920
            (root / 'config.json').write_text(json.dumps(config))
            with self.assertRaises(ValueError):
                prepare(root)


class PackageTests(unittest.TestCase):
    def test_upstream_package_builder_with_explicit_fake_sdk(self):
        # Structural packaging only, NOT a real SDK/Store integration test.
        import tarfile
        spec = importlib.util.spec_from_file_location('upstream_build', ROOT / 'kit/tools/build.py')
        builder = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(builder)
        with tempfile.TemporaryDirectory() as tmp:
            tmp = Path(tmp)
            sdk = tmp / 'fake-sdk'
            sdk.mkdir()
            (sdk / 'index.js').write_text('// TEST FIXTURE ONLY; not BMW SDK\n')
            (sdk / 'package.json').write_text('{"name":"test-fixture-only","version":"0.0.0"}')
            builder.SDK = str(sdk)
            builder.DIST = str(tmp / 'dist')
            with warnings.catch_warnings():
                # Upstream uses json.dump(open(...)); no change to vendored code.
                warnings.simplefilter('ignore', ResourceWarning)
                builder.build('custom_logo')
            package = tmp / 'dist/custom_logo/source'
            metadata = json.loads((package / 'package.json').read_text())
            self.assertEqual(metadata['mguAppStartType'], 'autostart')
            self.assertTrue((package / metadata['main']).is_file())
            self.assertTrue((package / 'javascript/logo-data.js').is_file())
            self.assertFalse((package / 'javascript/kit/mgu.js').exists())
            ui = json.loads((package / 'rhmiData/uiDescriptions/ID7/uiDescription.json').read_text())
            self.assertEqual(len(ui['containers']), 1)
            names = [c['name'] for state in ui['containers'].values() for c in state['components'].values()]
            self.assertIn('SAVE', names)
            self.assertIn('POSITION', names)
            version = json.loads((ROOT / 'apps/custom_logo/app.json').read_text())['version']
            with tarfile.open(tmp / ('dist/custom_logo@' + version + '.tgz')) as archive:
                self.assertIn('package/javascript/cluster_render_client.js', archive.getnames())

    def test_original_logo_is_byte_identical(self):
        import hashlib
        self.assertEqual(hashlib.sha256((ROOT / 'assets/logo.png').read_bytes()).hexdigest(),
                         '6679a78891be1afcb3721429e1985bda6668b8d85c982071816c1f7a7048f765')

    def test_texture_scaling_keeps_aspect_and_alpha(self):
        rgba = bytes([200, 100, 50, 128]) * (1024 * 512)
        w, h, out = display_texture(1024, 512, rgba)
        self.assertEqual((w, h), (512, 256))
        self.assertEqual(out, bytes([200, 100, 50, 128]) * (w * h))


if __name__ == '__main__':
    unittest.main()
