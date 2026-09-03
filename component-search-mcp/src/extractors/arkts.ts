import ts from "typescript";
import type { ComponentProp } from "../types.js";
import type { ExtractedComponent } from "./types.js";

const COMPONENT_DECORATORS = new Set([
  "Component",
  "ComponentV2",
  "Entry",
  "CustomDialog",
]);
const PROP_DECORATORS = new Set([
  "Prop",
  "Link",
  "ObjectLink",
  "BuilderParam",
  "Param",
]);
const STATE_DECORATORS = new Set([
  "State",
  "Provide",
  "Consume",
  "StorageLink",
  "StorageProp",
  "Local",
  "Monitor",
  "Computed",
]);

/**
 * TypeScript does not understand ArkTS `struct` declarations. `class ` has the
 * same length, so replacing it keeps every source offset stable for snippets
 * and documentation while letting the TypeScript parser recover the AST.
 */
function makeTypeScriptCompatible(content: string): string {
  return content.replace(/\bstruct\b/g, "class ");
}

function decoratorName(decorator: ts.Decorator): string | undefined {
  const expression = ts.isCallExpression(decorator.expression)
    ? decorator.expression.expression
    : decorator.expression;
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  return undefined;
}

function getDecoratorNames(node: ts.Node): string[] {
  if (!ts.canHaveDecorators(node)) return [];
  return (ts.getDecorators(node) ?? [])
    .map(decoratorName)
    .filter((name): name is string => Boolean(name));
}

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  return Boolean(
    ts.canHaveModifiers(node) &&
      ts.getModifiers(node)?.some((modifier) => modifier.kind === kind),
  );
}

function commentToText(comment: ts.JSDoc["comment"]): string {
  if (typeof comment === "string") return comment.trim();
  return comment?.map((part) => part.text).join("").trim() ?? "";
}

function readDocumentation(node: ts.Node): {
  description: string;
  useCases: string[];
  deprecated: boolean;
} {
  let description = "";
  const useCases: string[] = [];
  let deprecated = false;

  for (const entry of ts.getJSDocCommentsAndTags(node)) {
    if (ts.isJSDoc(entry)) {
      description ||= commentToText(entry.comment);
      for (const tag of entry.tags ?? []) {
        if (tag.tagName.text === "use-case") {
          const value = commentToText(tag.comment);
          if (value) useCases.push(value);
        }
        if (tag.tagName.text === "deprecated") deprecated = true;
      }
      continue;
    }

    if (entry.tagName.text === "use-case") {
      const value = commentToText(entry.comment);
      if (value) useCases.push(value);
    }
    if (entry.tagName.text === "deprecated") deprecated = true;
  }

  return { description, useCases, deprecated };
}

function getImports(sourceFile: ts.SourceFile): string[] {
  return sourceFile.statements.filter(ts.isImportDeclaration).map((statement) => {
    const moduleName = statement.moduleSpecifier
      .getText(sourceFile)
      .replace(/["']/g, "");
    const clause = statement.importClause?.getText(sourceFile);
    return clause ? `${clause} from ${moduleName}` : moduleName;
  });
}

function extractProps(
  node: ts.ClassDeclaration,
  sourceFile: ts.SourceFile,
): ComponentProp[] {
  return node.members.flatMap((member) => {
    if (!ts.isPropertyDeclaration(member) || !member.name) return [];
    const decorators = getDecoratorNames(member);
    if (!decorators.some((name) => PROP_DECORATORS.has(name))) return [];

    const documentation = readDocumentation(member);
    return [
      {
        name: member.name.getText(sourceFile),
        type: member.type?.getText(sourceFile) ?? "unknown",
        required:
          decorators.includes("Require") ||
          (!member.questionToken && !member.initializer),
        ...(documentation.description
          ? { description: documentation.description }
          : {}),
      },
    ];
  });
}

function collectImplementationDetails(
  node: ts.ClassDeclaration,
): { hooks: string[]; renderedElements: string[] } {
  const hooks = new Set<string>();
  const renderedElements = new Set<string>();

  for (const member of node.members) {
    if (ts.isPropertyDeclaration(member) && member.name) {
      for (const decorator of getDecoratorNames(member)) {
        if (STATE_DECORATORS.has(decorator)) {
          hooks.add(`@${decorator} ${member.name.getText()}`);
        }
      }
    }
  }

  function visit(current: ts.Node): void {
    if (
      ts.isCallExpression(current) &&
      ts.isIdentifier(current.expression) &&
      /^[A-Z][\w$]*$/.test(current.expression.text)
    ) {
      renderedElements.add(current.expression.text);
    }
    ts.forEachChild(current, visit);
  }

  for (const member of node.members) {
    if (!ts.isMethodDeclaration(member)) continue;
    const decorators = getDecoratorNames(member);
    const isBuildMethod =
      ts.isIdentifier(member.name) && member.name.text === "build";
    if (isBuildMethod || decorators.includes("Builder")) {
      visit(member.body ?? member);
    }
  }

  return { hooks: [...hooks], renderedElements: [...renderedElements] };
}

export function extractArktsComponents(
  fileName: string,
  content: string,
): ExtractedComponent[] {
  const compatibleContent = makeTypeScriptCompatible(content);
  const sourceFile = ts.createSourceFile(
    fileName,
    compatibleContent,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const imports = getImports(sourceFile);
  const extracted: ExtractedComponent[] = [];

  for (const statement of sourceFile.statements) {
    if (!ts.isClassDeclaration(statement) || !statement.name) continue;
    const decorators = getDecoratorNames(statement);
    if (!decorators.some((name) => COMPONENT_DECORATORS.has(name))) continue;

    const documentation = readDocumentation(statement);
    const implementation = collectImplementationDetails(statement);
    extracted.push({
      name: statement.name.text,
      description:
        documentation.description || `ArkUI component ${statement.name.text}`,
      framework: "arkui",
      parser: "arkts-ast",
      exportKind: hasModifier(statement, ts.SyntaxKind.DefaultKeyword)
        ? "default"
        : "named",
      status: documentation.deprecated ? "deprecated" : "stable",
      useCases: documentation.useCases,
      props: extractProps(statement, sourceFile),
      imports,
      hooks: implementation.hooks,
      renderedElements: implementation.renderedElements,
      sourceSnippet: content.slice(statement.getStart(sourceFile), statement.end).slice(0, 8_000),
    });
  }

  return extracted;
}
