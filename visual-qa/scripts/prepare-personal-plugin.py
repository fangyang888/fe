#!/usr/bin/env python3
"""Copy this plugin into the personal catalog; never install or enable it."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys


def main():
    source = Path(__file__).resolve().parent.parent
    name = 'visual-qa'
    destination = Path.home() / 'plugins' / name
    marketplace = Path.home() / '.agents/plugins/marketplace.json'
    codex_root = Path(os.environ.get('CODEX_HOME', str(Path.home() / '.codex')))
    helpers = codex_root / 'skills/.system/plugin-creator/scripts'
    scaffold = helpers / 'create_basic_plugin.py'
    reader = helpers / 'read_marketplace_name.py'
    files = ['package.json', 'package-lock.json', 'tsconfig.json', 'README.md', 'INSTALL.md', '.gitignore']
    directories = ['.codex-plugin', 'skills', 'scripts', 'src', 'test', 'cases']
    if destination.exists():
        raise SystemExit(f'{destination} already exists; nothing changed. See INSTALL.md for updating an existing plugin.')
    for item in files + directories:
        if not (source / item).exists():
            raise SystemExit(f'Missing plugin file: {item}; nothing changed.')
    if json.loads((source / '.codex-plugin/plugin.json').read_text())['name'] != name:
        raise SystemExit('Plugin manifest name must be visual-qa; nothing changed.')
    if not scaffold.is_file() or not reader.is_file():
        raise SystemExit('The Codex plugin-creator helper is unavailable. See INSTALL.md; nothing changed.')
    if marketplace.exists():
        subprocess.run([sys.executable, str(reader)], check=True)
    subprocess.run([sys.executable, str(scaffold), name, '--with-skills', '--with-scripts', '--with-marketplace'], check=True)
    for item in directories:
        shutil.copytree(source / item, destination / item, dirs_exist_ok=True, ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))
    for item in files:
        shutil.copy2(source / item, destination / item)
    catalog = subprocess.check_output([sys.executable, str(reader)], text=True).strip()
    print(f'\nPrepared: {destination}\nNot installed. Run this command yourself:\ncodex plugin add {name}@{catalog}')


if __name__ == '__main__':
    main()
