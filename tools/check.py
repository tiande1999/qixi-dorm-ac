"""Run the existing desktop-safe tests from any working directory."""
from pathlib import Path
import json
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
CHECKS = [
    ('firmware', [sys.executable, '-m', 'unittest', 'discover', '-s', 'tests/firmware', '-v']),
    ('web', ['node', '--test', '--test-reporter=tap', *[str(p.relative_to(ROOT)) for p in sorted((ROOT / 'web/tests').glob('*.test.mjs'))]]),
]

results = []
for name, command in CHECKS:
    try:
        result = subprocess.run(command, cwd=ROOT, capture_output=True, text=True,
                                encoding='utf-8', errors='replace')
    except FileNotFoundError:
        print('Missing runtime for ' + name + ': install Python 3 and Node.js 22+.')
        sys.exit(2)
    output = result.stdout + result.stderr
    count = re.search(r'Ran (\d+) tests?', output) if name == 'firmware' else re.search(r'# tests (\d+)', output)
    results.append({'suite': name, 'passed': result.returncode == 0,
                    'tests': int(count.group(1)) if count else None})
    print(name + ': ' + ('PASS' if result.returncode == 0 else 'FAIL') +
          (' (' + count.group(1) + ' tests)' if count else ''))
    if result.returncode:
        print(output)

artifacts = ROOT / 'artifacts'
artifacts.mkdir(exist_ok=True)
(artifacts / 'checks.json').write_text(json.dumps(results, indent=2) + '\n', encoding='utf-8')
sys.exit(0 if all(r['passed'] for r in results) else 1)
