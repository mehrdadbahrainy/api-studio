"""Fail for invalid UTF-8 and common mojibake in first-party project source."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXTENSIONS = {'.ts', '.html', '.scss', '.css', '.js', '.cjs', '.mjs', '.json', '.md', '.yml', '.yaml', '.rs', '.toml', '.py', '.txt'}
SKIP = {'node_modules', '.test-dist', 'dist', 'dist-tsc', 'target', '.git'}
BAD = ('\ufffd', '\u00c3', '\u00e2\u20ac', '\u00e2\u2020', '\u00c2\u00a0')
errors = []
for path in ROOT.rglob('*'):
    if not path.is_file() or path.suffix not in EXTENSIONS or SKIP.intersection(path.parts):
        continue
    try:
        text = path.read_text(encoding='utf-8')
    except UnicodeError:
        errors.append(f'{path.relative_to(ROOT)}: invalid UTF-8')
        continue
    for marker in BAD:
        if marker in text:
            errors.append(f'{path.relative_to(ROOT)}: suspicious encoding sequence {marker!r}')
if errors:
    print('\n'.join(errors))
    raise SystemExit(1)
print('Encoding validation passed')
