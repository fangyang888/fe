#!/usr/bin/env node
const major = Number(String(process.versions.node || '0').split('.')[0]);

if (!Number.isFinite(major) || major < 18) {
  Promise.all([
    import('fs'),
    import('os'),
    import('path'),
    import('child_process'),
    import('url'),
  ])
    .then(([fsMod, osMod, pathMod, cpMod, urlMod]) => {
      const fs = fsMod.default || fsMod;
      const os = osMod.default || osMod;
      const path = pathMod.default || pathMod;
      const { spawn, spawnSync } = cpMod;
      const fileURLToPath = urlMod.fileURLToPath;

      function findNode18Plus() {
        if (
          process.env.WV_AGENT_DISABLE_NODE_FALLBACK === '1' ||
          process.env.WV_AGENT_REEXEC === '1'
        ) {
          return null;
        }
        const isWin = process.platform === 'win32';
        const candidates = [];
        if (process.env.WV_AGENT_NODE) candidates.push(process.env.WV_AGENT_NODE);

        const home = os.homedir();
        const scanVersionDirs = (baseDir, binSubpath) => {
          try {
            const entries = fs.readdirSync(baseDir);
            const parsed = entries
              .map((name) => {
                const m = String(name).match(/^v?(\d+)\.(\d+)\.(\d+)/);
                return m
                  ? { name, maj: Number(m[1]), min: Number(m[2]), pat: Number(m[3]) }
                  : null;
              })
              .filter((v) => v && v.maj >= 18)
              .sort((a, b) => (b.maj - a.maj) || (b.min - a.min) || (b.pat - a.pat));
            for (const v of parsed) {
              candidates.push(path.join(baseDir, v.name, binSubpath));
            }
          } catch (e) {}
        };

        if (isWin) {
          const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
          const localAppData = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
          if (process.env.NVM_HOME) scanVersionDirs(process.env.NVM_HOME, 'node.exe');
          scanVersionDirs(path.join(appData, 'nvm'), 'node.exe');
          scanVersionDirs(path.join(appData, 'fnm', 'node-versions'), path.join('installation', 'node.exe'));
          scanVersionDirs(path.join(localAppData, 'Volta', 'tools', 'image', 'node'), 'node.exe');
          candidates.push('C:\\Program Files\\nodejs\\node.exe');
        } else {
          const nvmDir = process.env.NVM_DIR || path.join(home, '.nvm');
          scanVersionDirs(path.join(nvmDir, 'versions', 'node'), path.join('bin', 'node'));
          scanVersionDirs(path.join(home, '.fnm', 'node-versions'), path.join('installation', 'bin', 'node'));
          scanVersionDirs(path.join(home, '.volta', 'tools', 'image', 'node'), path.join('bin', 'node'));
          candidates.push('/opt/homebrew/bin/node', '/usr/local/bin/node');
        }

        const seen = new Set();
        for (const bin of candidates) {
          if (!bin || seen.has(bin)) continue;
          seen.add(bin);
          try {
            if (!fs.existsSync(bin)) continue;
            const probe = spawnSync(bin, ['-p', 'process.versions.node'], {
              encoding: 'utf8',
              timeout: 3000,
            });
            const vMaj = Number(String((probe && probe.stdout) || '0').trim().split('.')[0]);
            if (probe && probe.status === 0 && vMaj >= 18) return bin;
          } catch (e) {}
        }
        return null;
      }

      const node18 = findNode18Plus();
      if (node18) {
        const selfPath = fileURLToPath(import.meta.url);
        // Re-exec wv-agent with Node 18+ while preserving PATH untouched so child dev commands
        // (e.g. Node 14 projects like bbj) continue running under the user's Node 14 runtime!
        const child = spawn(node18, [selfPath, ...process.argv.slice(2)], {
          stdio: 'inherit',
          env: Object.assign({}, process.env, { WV_AGENT_REEXEC: '1' }),
        });
        process.on('SIGINT', () => {});
        process.on('SIGTERM', () => {
          try { child.kill('SIGTERM'); } catch (e) {}
        });
        child.on('error', (err) => {
          console.error('[wv-agent] Failed to launch Node 18+ runtime:', err && err.message ? err.message : String(err));
          process.exit(1);
        });
        child.on('exit', (code, signal) => {
          if (typeof code === 'number') process.exit(code);
          else if (signal === 'SIGINT') process.exit(130);
          else if (signal === 'SIGTERM') process.exit(143);
          else process.exit(1);
        });
        return;
      }

      console.error(
        `[wv-agent] CLI & Hub require Node.js >= 18.0.0 (current: v${process.versions.node}).\n` +
          `Note: the Connect/Express/Koa/Webpack middleware supports Node.js >= 14.0.0.\n` +
          `Tip: install Node 18+ (via nvm/fnm/volta) or set WV_AGENT_NODE=/path/to/node18+ so "wv-agent dev" can start Hub automatically.`
      );
      process.exit(1);
    })
    .catch((err) => {
      console.error(err && err.message ? err.message : String(err));
      process.exit(1);
    });
} else {
  import('../src/cli.mjs')
    .then(({ main }) => main(process.argv.slice(2)))
    .catch((err) => {
      console.error(JSON.stringify({ ok: false, error: err && err.message ? err.message : String(err) }, null, 2));
      process.exit(1);
    });
}
