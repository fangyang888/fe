#!/usr/bin/env python3
"""Build a portable local marketplace ZIP; never register or install it."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import zipfile


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=Path, help='ZIP path; defaults to artifacts/visual-qa-local-VERSION.zip')
    args = parser.parse_args()
    source = Path(__file__).resolve().parent.parent
    helpers = Path(os.environ.get('CODEX_HOME', str(Path.home() / '.codex'))) / 'skills/.system/plugin-creator/scripts'
    scaffold = helpers / 'create_basic_plugin.py'
    if not scaffold.is_file():
        raise SystemExit('Packaging requires the author-side plugin-creator helper; recipients do not need it.')
    package = json.loads((source / 'package.json').read_text(encoding='utf-8'))
    version = package.get('version')
    if not isinstance(version, str) or not re.fullmatch(r'(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?', version):
        raise SystemExit('package.json must contain a valid version such as 0.2.0 or 0.2.0-beta.1.')
    subprocess.run(['npm', 'run', 'build'], cwd=source, check=True)
    output = (args.output or source / f'artifacts/visual-qa-local-{version}.zip').resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='visual-qa-package-') as temp:
        root = Path(temp) / 'visual-qa-local'
        subprocess.run([sys.executable, str(scaffold), 'visual-qa', '--path', str(root / 'plugins'), '--with-skills', '--with-scripts', '--with-marketplace', '--marketplace-path', str(root / '.agents/plugins/marketplace.json'), '--marketplace-name', 'visual-qa-local'], check=True)
        plugin = root / 'plugins/visual-qa'
        for name in ['.codex-plugin', 'skills', 'scripts', 'src', 'test', 'cases', 'distribution']:
            shutil.copytree(source / name, plugin / name, dirs_exist_ok=True, ignore=shutil.ignore_patterns('__pycache__', '*.pyc'))
        shutil.copytree(source / 'dist/src', plugin / 'dist/src')
        for name in ['package.json', 'package-lock.json', 'tsconfig.json', 'README.md', 'INSTALL.md', '.gitignore']:
            shutil.copy2(source / name, plugin / name)
        manifest_path = plugin / '.codex-plugin/plugin.json'
        manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
        manifest['version'] = version
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        subprocess.run([sys.executable, str(helpers / 'update_plugin_cachebuster.py'), str(plugin)], check=True)
        for name in ['install.py', 'README.md']:
            shutil.copy2(source / 'distribution' / name, root / name)
        with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as archive:
            for path in sorted(root.rglob('*')):
                if path.is_file():
                    archive.write(path, path.relative_to(root.parent))
    digest = hashlib.sha256(output.read_bytes()).hexdigest()
    output.with_suffix('.zip.sha256').write_text(f'{digest}  {output.name}\n', encoding='utf-8')
    print(f'Created {output}\nSHA-256: {digest}\nNo plugin installed or marketplace registered.')


if __name__ == '__main__':
    main()
