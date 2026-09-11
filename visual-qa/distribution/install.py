#!/usr/bin/env python3
"""Register and install the adjacent local marketplace when run by its recipient."""
import argparse
import json
from pathlib import Path
import shutil
import subprocess
import sys


def main():
    parser = argparse.ArgumentParser(description='Install the bundled Visual QA plugin into Codex.')
    parser.add_argument('--dry-run', action='store_true', help='Check the bundle and print commands without registering or installing.')
    args = parser.parse_args()
    root = Path(__file__).resolve().parent
    catalog_path = root / '.agents/plugins/marketplace.json'
    plugin_root = root / 'plugins/visual-qa'
    for file in [catalog_path, plugin_root / '.codex-plugin/plugin.json', plugin_root / 'skills/visual-qa/SKILL.md', plugin_root / 'dist/src/cli.js']:
        if not file.is_file():
            raise SystemExit(f'Incomplete bundle: {file}. Extract the entire ZIP first.')
    catalog = json.loads(catalog_path.read_text(encoding='utf-8'))
    if catalog.get('name') != 'visual-qa-local':
        raise SystemExit('Unexpected marketplace name.')
    entries = catalog.get('plugins', [])
    if len(entries) != 1 or entries[0].get('name') != 'visual-qa' or entries[0].get('source') != {'source': 'local', 'path': './plugins/visual-qa'}:
        raise SystemExit('Unexpected plugin source; refusing to install.')
    binary = shutil.which('codex')
    if not binary and sys.platform == 'darwin':
        for app in ['Codex', 'ChatGPT']:
            candidate = Path('/Applications') / f'{app}.app/Contents/Resources/codex'
            if candidate.is_file():
                binary = str(candidate)
                break
    if not binary:
        raise SystemExit('Codex CLI not found. Install Codex CLI or add codex to PATH, then retry.')
    commands = [
        [binary, 'plugin', 'marketplace', 'add', str(root)],
        [binary, 'plugin', 'add', 'visual-qa@visual-qa-local'],
    ]
    if args.dry_run:
        for command in commands:
            print(json.dumps(command, ensure_ascii=False))
        print('Bundle valid. Dry run only; no Codex configuration changed.')
        return
    for command in commands:
        subprocess.run(command, check=True)
    print('Visual QA installed. Start a new Codex task to use it.')
    print('Keep this extracted directory for future updates. See README.md for first-use dependencies.')


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, subprocess.CalledProcessError) as error:
        print(f'Installation failed: {error}', file=sys.stderr)
        sys.exit(1)
