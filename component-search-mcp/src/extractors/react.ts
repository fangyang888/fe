import ts from "typescript";
import type { ComponentProp } from "../types.js";
import type { ExtractedComponent } from "./types.js";

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  return Boolean(
    ts.canHaveModifiers(node) && ts.getModifiers(node)?.some((item) => item.kind === kind),
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

function memberToProp(member: ts.TypeElement, sourceFile: ts.SourceFile): ComponentProp | null {
  if (!ts.isPropertySignature(member) && !ts.isMethodSignature(member)) return null;

  const name = member.name?.getText(sourceFile);
  if (!name) return null;

  const documentation = readDocumentation(member);
  return {
    name,
    type: member.type?.getText(sourceFile) ?? "unknown",
    required: !member.questionToken,
    ...(documentation.description ? { description: documentation.description } : {}),
  };
}

function findPropsDeclaration(
  sourceFile: ts.SourceFile,
  typeName: string,
): ts.NodeArray<ts.TypeElement> | undefined {
  for (const statement of sourceFile.statements) {
    if (
      (ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) &&
      statement.name.text === typeName
    ) {
      if (ts.isInterfaceDeclaration(statement)) return statement.members;
      if (ts.isTypeLiteralNode(statement.type)) return statement.type.members;
    }
  }
  return undefined;
}

function typeNameFromTypeNode(type: ts.TypeNode | undefined): string | undefined {
  if (!type || !ts.isTypeReferenceNode(type)) return undefined;
  const text = type.typeName.getText();
  if (/^(?:React\.)?(?:FC|FunctionComponent)$/.test(text)) {
    return type.typeArguments?.[0]?.getText();
  }
  return text;
}

function extractProps(
  node: ts.FunctionDeclaration | ts.ClassDeclaration | ts.VariableDeclaration,
  componentName: string,
  sourceFile: ts.SourceFile,
): ComponentProp[] {
  let inlineMembers: ts.NodeArray<ts.TypeElement> | undefined;
  let typeName: string | undefined;

  if (ts.isFunctionDeclaration(node)) {
    const parameterType = node.parameters[0]?.type;
    if (parameterType && ts.isTypeLiteralNode(parameterType)) {
      inlineMembers = parameterType.members;
    } else {
      typeName = typeNameFromTypeNode(parameterType);
    }
  } else if (ts.isVariableDeclaration(node)) {
    typeName = typeNameFromTypeNode(node.type);
    const initializer = node.initializer;
    if (initializer && (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer))) {
      const parameterType = initializer.parameters[0]?.type;
      if (parameterType && ts.isTypeLiteralNode(parameterType)) {
        inlineMembers = parameterType.members;
      } else {
        typeName ||= typeNameFromTypeNode(parameterType);
      }
    }
  } else {
    const heritage = node.heritageClauses
      ?.flatMap((clause) => clause.types)
      .find((item) => /(?:Component|PureComponent)$/.test(item.expression.getText(sourceFile)));
    typeName = heritage?.typeArguments?.[0]?.getText(sourceFile);
  }

  const members =
    inlineMembers ??
    (typeName ? findPropsDeclaration(sourceFile, typeName) : undefined) ??
    findPropsDeclaration(sourceFile, `${componentName}Props`) ??
    findPropsDeclaration(sourceFile, "Props");

  return (
    members
      ?.map((member) => memberToProp(member, sourceFile))
      .filter((prop): prop is ComponentProp => prop !== null) ?? []
  );
}

function collectImplementationDetails(node: ts.Node, sourceFile: ts.SourceFile): {
  hooks: string[];
  renderedElements: string[];
} {
  const hooks = new Set<string>();
  const renderedElements = new Set<string>();

  function visit(current: ts.Node): void {
    if (ts.isCallExpression(current)) {
      const callee = current.expression.getText(sourceFile);
      if (/^use[A-Z0-9]/.test(callee) || /\.use[A-Z0-9]/.test(callee)) {
        hooks.add(callee);
      }
    }
    if (ts.isJsxOpeningElement(current) || ts.isJsxSelfClosingElement(current)) {
      renderedElements.add(current.tagName.getText(sourceFile));
    }
    ts.forEachChild(current, visit);
  }

  visit(node);
  return { hooks: [...hooks], renderedElements: [...renderedElements] };
}

function getImports(sourceFile: ts.SourceFile): string[] {
  return sourceFile.statements
    .filter(ts.isImportDeclaration)
    .map((statement) => {
      const moduleName = statement.moduleSpecifier.getText(sourceFile).replace(/["']/g, "");
      const clause = statement.importClause?.getText(sourceFile);
      return clause ? `${clause} from ${moduleName}` : moduleName;
    });
}

function isComponentName(value: string | undefined): value is string {
  return Boolean(value && /^[A-Z][\w$]*$/.test(value));
}

export function extractReactComponents(
  fileName: string,
  content: string,
): ExtractedComponent[] {
  const scriptKind = fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.JSX;
  const sourceFile = ts.createSourceFile(
    fileName,
    content,
    ts.ScriptTarget.Latest,
    true,
    scriptKind,
  );
  const imports = getImports(sourceFile);
  const extracted: ExtractedComponent[] = [];

  function addComponent(
    node: ts.FunctionDeclaration | ts.ClassDeclaration | ts.VariableDeclaration,
    name: string,
    owner: ts.Node,
  ): void {
    const documentation = readDocumentation(owner);
    const implementation = collectImplementationDetails(node, sourceFile);
    extracted.push({
      name,
      description: documentation.description || `Project component ${name}`,
      framework: "react",
      parser: "typescript-ast",
      exportKind: hasModifier(owner, ts.SyntaxKind.DefaultKeyword) ? "default" : "named",
      status: documentation.deprecated ? "deprecated" : "stable",
      useCases: documentation.useCases,
      props: extractProps(node, name, sourceFile),
      imports,
      hooks: implementation.hooks,
      renderedElements: implementation.renderedElements,
      sourceSnippet: node.getText(sourceFile).slice(0, 8_000),
    });
  }

  for (const statement of sourceFile.statements) {
    if (
      (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) &&
      isComponentName(statement.name?.text) &&
      (hasModifier(statement, ts.SyntaxKind.ExportKeyword) ||
        hasModifier(statement, ts.SyntaxKind.DefaultKeyword))
    ) {
      addComponent(statement, statement.name.text, statement);
      continue;
    }

    if (ts.isVariableStatement(statement) && hasModifier(statement, ts.SyntaxKind.ExportKeyword)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && isComponentName(declaration.name.text)) {
          addComponent(declaration, declaration.name.text, statement);
        }
      }
    }
  }

  return extracted;
}
