#!/usr/bin/env python3
"""Build an Antigravity IDE plugin ZIP without installing it."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import zipfile


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    source = Path(__file__).resolve().parent.parent
    version = json.loads((source / 'package.json').read_text())['version']
    subprocess.run(['npm', 'run', 'build'], cwd=source, check=True)
    output = (args.output or source / f'artifacts/visual-qa-antigravity-{version}.zip').resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='visual-qa-antigravity-') as temp:
        root = Path(temp) / 'visual-qa-antigravity'
        plugin = root / 'visual-qa'
        plugin.mkdir(parents=True)
        (plugin / 'plugin.json').write_text(json.dumps({'name': 'visual-qa'}, indent=2)+'\n')
        for name in ['skills', 'src', 'test', 'cases']:
            shutil.copytree(source / name, plugin / name, ignore=shutil.ignore_patterns('__pycache__','*.pyc'))
        shutil.copytree(source / 'dist/src', plugin / 'dist/src')
        (plugin / 'scripts').mkdir()
        shutil.copy2(source / 'scripts/run.mjs', plugin / 'scripts/run.mjs')
        for name in ['package.json', 'package-lock.json', 'tsconfig.json', '.gitignore']:
            shutil.copy2(source / name, plugin / name)
        # Keep the shared CLI reference; omit Codex-specific installation instructions.
        docs = (source / 'README.md').read_text(encoding='utf-8').split('## Codex 插件')[0]
        (plugin / 'README.md').write_text(docs, encoding='utf-8')
        for name in ['install.py', 'README.md']:
            shutil.copy2(source / 'distribution/antigravity' / name, root / name)
        with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as archive:
            for path in sorted(root.rglob('*')):
                if path.is_file():
                    archive.write(path, path.relative_to(root.parent))
    digest = hashlib.sha256(output.read_bytes()).hexdigest()
    output.with_suffix('.zip.sha256').write_text(f'{digest}  {output.name}\n')
    print(f'Created {output}\nSHA-256: {digest}\nNo plugin installed.')


if __name__ == '__main__':
    main()
