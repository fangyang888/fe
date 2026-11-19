// Read exported symbols with TypeScript's compiler API without loading the target package.
const fs = require("node:fs");
const path = require("node:path");
const ts = require(process.argv[2]);
const {root, entries} = JSON.parse(fs.readFileSync(0, "utf8"));
const inScope = file => {
  const rel = path.relative(root, fs.realpathSync(file));
  return !rel.startsWith(".." + path.sep) && rel !== ".." &&
    !path.isAbsolute(rel) && !rel.split(path.sep).includes("node_modules");
};
const options = {
  allowJs: true, checkJs: false, skipLibCheck: true, noLib: true, types: [],
  moduleResolution: ts.ModuleResolutionKind.NodeJs, jsx: ts.JsxEmit.Preserve,
};
const host = ts.createCompilerHost(options);
const read = host.readFile;
host.readFile = file => fs.existsSync(file) && inScope(file) ? read(file) : undefined;
const program = ts.createProgram(entries.map(e => e.path), options, host);
const checker = program.getTypeChecker();
const records = [];
for (const entry of entries) {
  const source = program.getSourceFile(entry.path);
  const moduleSymbol = source && checker.getSymbolAtLocation(source);
  if (!moduleSymbol) continue;
  for (const exp of checker.getExportsOfModule(moduleSymbol)) {
    const symbol = exp.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exp) : exp;
    if (!(symbol.flags & ts.SymbolFlags.Value)) continue;
    const decl = symbol.valueDeclaration || symbol.declarations?.[0];
    if (!decl) continue;
    let name = exp.name;
    if (name === "default") {
      name = decl.name?.text || entry.hint;
      if (name === "default") name = entry.hint;
    }
    if (!name || !/^[A-Z][A-Za-z0-9_$]*$/.test(name)) continue;
    const spans = [];
    const seen = new Set();
    function addSpan(node, kind) {
      const src = node.getSourceFile();
      if (!inScope(src.fileName) || seen.has(node)) return;
      seen.add(node);
      const start = node.jsDoc?.[0]?.pos ?? node.getStart(src);
      spans.push({file: fs.realpathSync(src.fileName), kind,
        start: src.getLineAndCharacterOfPosition(start).line + 1,
        end: src.getLineAndCharacterOfPosition(node.end - 1).line + 1});
    }
    addSpan(decl, "code");
    function visit(node) {
      if (ts.isTypeReferenceNode(node) || ts.isExpressionWithTypeArguments(node)) {
        let type = checker.getSymbolAtLocation(node.typeName || node.expression);
        if (type && type.flags & ts.SymbolFlags.Alias) type = checker.getAliasedSymbol(type);
        for (const def of type?.declarations || []) {
          if (ts.isInterfaceDeclaration(def) || ts.isTypeAliasDeclaration(def)) addSpan(def, "api");
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(decl);
    if (spans.length) records.push({name, module: entry.module, exportName: exp.name, spans});
  }
}
process.stdout.write(JSON.stringify(records));
