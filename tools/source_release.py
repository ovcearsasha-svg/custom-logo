"""Source-only release; never packages a BMW SDK or test .tgz."""
import hashlib
import json
import subprocess
from pathlib import Path
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED
from prepare import ROOT, prepare

if __name__ == '__main__':
    prepare()
    out = ROOT / 'dist'
    out.mkdir(exist_ok=True)
    version = json.loads((ROOT / 'apps/custom_logo/app.json').read_text(encoding='utf-8'))['version']
    target = out / ('custom-logo-' + version + '-source.zip')
    tracked = subprocess.check_output(['git', 'ls-files', '-z'], cwd=ROOT).decode().split('\0')
    generated = ['apps/custom_logo/logo-data.js', 'apps/custom_logo/logo-config.js']
    names = sorted(set(n for n in tracked + generated if n))
    with ZipFile(target, 'w', ZIP_DEFLATED) as archive:
        for name in names:
            if any(part in {'.git', 'dist', 'oap-sdk', 'node_modules', '__pycache__'} for part in Path(name).parts):
                continue
            info = ZipInfo('custom-logo/' + name, (2026, 11, 25, 0, 0, 0))
            info.compress_type = ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            archive.writestr(info, (ROOT / name).read_bytes())
    digest = hashlib.sha256(target.read_bytes()).hexdigest()
    (out / 'SHA256SUMS.txt').write_text(digest + '  ' + target.name + '\n', encoding='utf-8')
    print(target.name, digest)
