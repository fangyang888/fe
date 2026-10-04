const ts = require('typescript');
const fs = require('node:fs');
const path = require('node:path');
const source = path.resolve(__dirname, '../../src/lib');
const outDir = path.resolve(__dirname, '../generated/vector');
const program = ts.createProgram([path.join(source, 'likely32Lab.ts')], {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
  moduleResolution: ts.ModuleResolutionKind.Node10, strict: true,
  skipLibCheck: true, types: [], noEmitOnError: true, rootDir: source, outDir,
});
const diagnostics = ts.getPreEmitDiagnostics(program);
if (diagnostics.length) {
  console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: f => f, getCurrentDirectory: () => process.cwd(), getNewLine: () => '\n',
  }));
  process.exit(1);
}
if (program.emit().emitSkipped) process.exit(1);
fs.writeFileSync(path.join(outDir, 'package.json'), JSON.stringify({type: 'commonjs'}));
console.error('Vector MCP engine compiled from the frontend source.');
