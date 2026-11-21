// Usage: node export.cjs raw-history.json feature-output.json
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText, filename);
const {buildLikely32Lab, features, parseLabHistory} = require('../../src/lib/likely32Lab.ts');
const input = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const history = parseLabHistory(input);
const lab = buildLikely32Lab(input);
const rows = [];
for (let t = 10; t <= history.length; t++) {
  const f = features(history.slice(0, t));
  const target = history[t] ?? {year: history.at(-1).year, No: history.at(-1).No + 1, numbers: [1,2,3,4,5,6,7]};
  // Placeholder outcome on final context is never used to fit or score a forecast.
  rows.push({t, year: target.year, No: target.No, actual: target.numbers[6], unlabeled: t === history.length,
    expert_picks: t === history.length ? lab.current.picks : lab.rows[t - 10].picks,
    features: f.map(x => [x.miss, x.ratio, x.score, x.group, x.bucket])});
}
fs.writeFileSync(process.argv[3], JSON.stringify({history, rows}));
console.log('Exported', rows.length - 1, 'causal labeled contexts plus current context');
