"""Local package build only. No deploy, SSH, service changes or SDK download."""
from pathlib import Path
import sys
from prepare import prepare, ROOT

if __name__ == '__main__':
    if sys.argv[1:] not in ([], ['custom_logo']):
        raise SystemExit('Only custom_logo is supported')
    # Check before importing/invoking the upstream builder (which clears staging).
    if not all((ROOT / 'oap-sdk' / name).is_file() for name in ('index.js', 'package.json')):
        raise SystemExit('MGU oap-sdk is not available. Local MVP/tests need no SDK; no vehicle package was built.')
    prepare()
    import importlib.util
    spec = importlib.util.spec_from_file_location('kit_build', ROOT / 'kit/tools/build.py')
    builder = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(builder)
    expected = ROOT / 'dist/custom_logo'
    if expected.resolve().parent != (ROOT / 'dist').resolve():
        raise SystemExit('Unsafe staging path')
    builder.build('custom_logo')
