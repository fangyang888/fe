#!/usr/bin/env python3
"""Install a local Antigravity plugin without changing Codex configuration."""
import argparse
import json
from pathlib import Path
import shutil
import sys


def main():
    parser = argparse.ArgumentParser(description='Install Visual QA for Antigravity.')
    parser.add_argument('--workspace', type=Path, help='Install only in this existing workspace instead of globally.')
    parser.add_argument('--dry-run', action='store_true', help='Check files and display destination without writing.')
    args = parser.parse_args()
    source = Path(__file__).resolve().parent / 'visual-qa'
    required = ['plugin.json', 'skills/visual-qa/SKILL.md', 'scripts/run.mjs', 'dist/src/cli.js', 'package.json', 'package-lock.json']
    for item in required:
        if not (source / item).is_file():
            raise SystemExit(f'Incomplete bundle: {item}. Extract the entire ZIP first.')
    if json.loads((source / 'plugin.json').read_text(encoding='utf-8')).get('name') != 'visual-qa':
        raise SystemExit('Unexpected plugin name; nothing changed.')
    if args.workspace:
        workspace = args.workspace.expanduser().resolve()
        if not workspace.is_dir():
            raise SystemExit(f'Workspace does not exist: {workspace}')
        destination = workspace / '.agents/plugins/visual-qa'
    else:
        destination = Path.home() / '.gemini/config/plugins/visual-qa'
    if destination.exists() or destination.is_symlink():
        raise SystemExit(f'{destination} already exists; nothing overwritten. See README.md for updating.')
    if args.dry_run:
        print(f'Bundle valid. Would copy to: {destination}\nDry run only; no files changed.')
        return
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(source, destination)
    print(f'Plugin files installed: {destination}')
    print('Restart Antigravity and start a new conversation to load the plugin.')
    print('First use: ask the agent to initialize npm dependencies in this plugin directory.')
    print('Antigravity activation has not been verified by this script. See README.md.')


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError) as error:
        print(f'Installation failed: {error}', file=sys.stderr)
        sys.exit(1)
