"""Package only the public static website; no cloud identity or repository metadata."""
from pathlib import Path
import hashlib
import zipfile

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'web/dist'
OUTPUT = ROOT / 'artifacts/qixi-site-v3.zip'
ALLOWED = {'.html', '.css', '.js', '.svg', '.png', '.webmanifest'}
files = sorted(p for p in SOURCE.rglob('*') if p.is_file())
if not (SOURCE / 'index.html').is_file():
    raise SystemExit('web/dist/index.html is missing')
for path in files:
    if path.suffix not in ALLOWED or any(part.startswith('.') for part in path.relative_to(SOURCE).parts):
        raise SystemExit('Unexpected public file: ' + str(path.relative_to(SOURCE)))
OUTPUT.parent.mkdir(exist_ok=True)
with zipfile.ZipFile(OUTPUT, 'w', zipfile.ZIP_DEFLATED) as archive:
    for path in files:
        archive.write(path, path.relative_to(SOURCE).as_posix())
with zipfile.ZipFile(OUTPUT) as archive:
    if archive.testzip() is not None:
        raise SystemExit('Archive verification failed')
    for path in files:
        if archive.read(path.relative_to(SOURCE).as_posix()) != path.read_bytes():
            raise SystemExit('Archive content mismatch')
print(str(OUTPUT))
print(str(len(files)) + ' files; ' + str(OUTPUT.stat().st_size) + ' bytes')
print('SHA256: ' + hashlib.sha256(OUTPUT.read_bytes()).hexdigest())
