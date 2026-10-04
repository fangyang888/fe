// Usage: node export.cjs raw-history.json feature-output.json
const fs = require('node:fs');
const ts = require('typescript');
const path = require('node:path');
const {createRequire} = require('node:module');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText, filename);
const root = path.resolve(__dirname, '../..');
const src = fs.readFileSync(path.join(root, 'src/lib/likely32Lab.ts'), 'utf8').replace('function features(', 'export function features(');
const js = ts.transpileModule(src, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText;
const mod = {exports: {}};
new Function('module', 'exports', 'require', js)(mod, mod.exports, createRequire(path.join(root, 'src/lib/likely32Lab.ts')));
const history = mod.exports.parseLabHistory(JSON.parse(fs.readFileSync(process.argv[2], 'utf8')));
const lab = mod.exports.buildLikely32Lab(JSON.parse(fs.readFileSync(process.argv[2], 'utf8')));
const rows = [];
for (let t = 10; t <= history.length; t++) {
  const f = mod.exports.features(history.slice(0, t));
  const target = history[t] ?? {year: history.at(-1).year, No: history.at(-1).No + 1, numbers: [1,2,3,4,5,6,7]};
  // Placeholder outcome on final context is never used to fit or score a forecast.
  rows.push({t, year: target.year, No: target.No, actual: target.numbers[6], unlabeled: t === history.length,
    expert_picks: t === history.length ? lab.current.picks : lab.rows[t - 10].picks,
    features: f.map(x => [x.miss, x.ratio, x.score, x.group, x.bucket])});
}
fs.writeFileSync(process.argv[3], JSON.stringify({history, rows}));
console.log('Exported', rows.length - 1, 'causal labeled contexts plus current context');
