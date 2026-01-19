import { Lang, type SgNode, parse } from "@ast-grep/napi";
import { getContext } from "./context.ts";
import type { ClassSite, ClassToken, ExtractionResult, NonLiteralSite } from "./types.ts";

const DEFAULT_CLASS_FUNCTIONS = ["cn", "clsx", "cva"] as const;

interface ExtractionOptions {
  classFunctions?: string[];
}

interface LiteralAnalysis {
  fragments: Array<{ text: string; startLine: number; startColumn: number }>;
  nonLiteral: boolean;
}

function splitClassTokens(text: string): Array<{ value: string; startOffset: number }> {
  const tokens: Array<{ value: string; startOffset: number }> = [];
  let current = "";
  let startOffset = 0;
  let bracketDepth = 0;
  let parenDepth = 0;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (!char) {
      continue;
    }

    if (char === "[") {
      bracketDepth += 1;
    } else if (char === "]") {
      bracketDepth = Math.max(0, bracketDepth - 1);
    } else if (char === "(") {
      parenDepth += 1;
    } else if (char === ")") {
      parenDepth = Math.max(0, parenDepth - 1);
    }

    const isWhitespace = /\s/.test(char);
    if (isWhitespace && bracketDepth === 0 && parenDepth === 0) {
      if (current.length > 0) {
        tokens.push({ value: current, startOffset });
        current = "";
      }
      continue;
    }

    if (current.length === 0) {
      startOffset = i;
    }

    current += char;
  }

  if (current.length > 0) {
    tokens.push({ value: current, startOffset });
  }

  return tokens;
}

function offsetToLineColumn(text: string, baseLine: number, baseColumn: number, offset: number) {
  const prefix = text.slice(0, offset);
  const lines = prefix.split("\n");
  if (lines.length === 1) {
    return { line: baseLine, column: baseColumn + offset };
  }

  return {
    line: baseLine + lines.length - 1,
    column: (lines[lines.length - 1] ?? "").length,
  };
}

function fragmentHasTemplateSubstitution(fragmentNode: SgNode): boolean {
  const ancestors = fragmentNode.ancestors();
  for (const ancestor of ancestors) {
    if (ancestor.kind() === "template_string") {
      const substitution = ancestor.find({ rule: { kind: "template_substitution" } });
      return Boolean(substitution);
    }
  }

  return false;
}

function collectLiteralFragments(
  node: SgNode
): Array<{ text: string; startLine: number; startColumn: number }> {
  const fragments: Array<{ text: string; startLine: number; startColumn: number }> = [];
  const nodes = node.findAll({ rule: { kind: "string_fragment" } });

  for (const fragment of nodes) {
    if (fragmentHasTemplateSubstitution(fragment)) {
      continue;
    }

    const range = fragment.range();
    fragments.push({
      text: fragment.text(),
      startLine: range.start.line,
      startColumn: range.start.column,
    });
  }

  return fragments;
}

function isLiteralExpression(node: SgNode): boolean {
  const kind = node.kind();

  if (kind === "string") {
    return true;
  }

  if (kind === "template_string") {
    return !node.find({ rule: { kind: "template_substitution" } });
  }

  if (kind === "parenthesized_expression") {
    const inner = node.children().find((child) => child.isNamed());
    return inner ? isLiteralExpression(inner) : false;
  }

  if (kind === "as_expression" || kind === "type_assertion") {
    const inner = node.children().find((child) => child.isNamed());
    return inner ? isLiteralExpression(inner) : false;
  }

  return false;
}

function analyzeExpression(node: SgNode, classFunctions: string[]): LiteralAnalysis {
  const kind = node.kind();

  if (kind === "call_expression") {
    const callee = node.children().find((child) => child.kind() === "identifier");
    const calleeName = callee?.text() ?? "";

    if (!classFunctions.includes(calleeName)) {
      return {
        fragments: collectLiteralFragments(node),
        nonLiteral: true,
      };
    }

    const argumentsNode = node.children().find((child) => child.kind() === "arguments");
    const argNodes = argumentsNode?.children().filter((child) => child.isNamed()) ?? [];

    let nonLiteral = false;
    for (const arg of argNodes) {
      if (!isLiteralExpression(arg)) {
        nonLiteral = true;
        break;
      }
    }

    return {
      fragments: collectLiteralFragments(argumentsNode ?? node),
      nonLiteral,
    };
  }

  return {
    fragments: collectLiteralFragments(node),
    nonLiteral: !isLiteralExpression(node),
  };
}

function analyzeClassNameAttribute(attr: SgNode, classFunctions: string[]): LiteralAnalysis {
  const stringNode = attr.children().find((child) => child.kind() === "string");
  if (stringNode) {
    return {
      fragments: collectLiteralFragments(stringNode),
      nonLiteral: false,
    };
  }

  const expressionNode = attr
    .find({ rule: { kind: "jsx_expression" } })
    ?.children()
    .find((child) => child.isNamed());

  if (expressionNode) {
    return analyzeExpression(expressionNode, classFunctions);
  }

  return {
    fragments: [],
    nonLiteral: false,
  };
}

function isInsideClassNameAttribute(node: SgNode): boolean {
  return node
    .ancestors()
    .some(
      (ancestor) =>
        ancestor.kind() === "jsx_attribute" &&
        ancestor.find({ rule: { kind: "property_identifier", regex: "^className$" } })
    );
}

function analyzeCallExpression(node: SgNode, classFunctions: string[]): LiteralAnalysis | null {
  const callee = node.children().find((child) => child.kind() === "identifier");
  if (!callee) {
    return null;
  }

  if (!classFunctions.includes(callee.text())) {
    return null;
  }

  const argumentsNode = node.children().find((child) => child.kind() === "arguments");
  const argNodes = argumentsNode?.children().filter((child) => child.isNamed()) ?? [];

  let nonLiteral = false;
  for (const arg of argNodes) {
    if (!isLiteralExpression(arg)) {
      nonLiteral = true;
      break;
    }
  }

  return {
    fragments: collectLiteralFragments(argumentsNode ?? node),
    nonLiteral,
  };
}

export function extractClassTokens(
  source: string,
  filePath: string,
  options: ExtractionOptions = {}
): ExtractionResult {
  const classFunctions = options.classFunctions ?? [...DEFAULT_CLASS_FUNCTIONS];
  const root = parse(Lang.Tsx, source);
  const context = getContext(filePath, source);

  const tokens: ClassToken[] = [];
  const sites: ClassSite[] = [];
  const nonLiteralSites: NonLiteralSite[] = [];
  let classSites = 0;

  const classNameAttrs = root.root().findAll({ rule: { kind: "jsx_attribute" } });

  for (const attr of classNameAttrs) {
    const nameNode = attr.find({ rule: { kind: "property_identifier", regex: "^className$" } });
    if (!nameNode) {
      continue;
    }

    classSites += 1;
    const analysis = analyzeClassNameAttribute(attr, classFunctions);
    const range = attr.range();

    if (analysis.nonLiteral) {
      nonLiteralSites.push({
        filePath,
        line: range.start.line + 1,
        column: range.start.column + 1,
        context,
      });
    }

    const siteClasses: string[] = [];

    for (const fragment of analysis.fragments) {
      const classTokens = splitClassTokens(fragment.text);
      for (const token of classTokens) {
        const pos = offsetToLineColumn(
          fragment.text,
          fragment.startLine,
          fragment.startColumn,
          token.startOffset
        );

        if (token.value.length > 0) {
          siteClasses.push(token.value);
        }

        tokens.push({
          value: token.value,
          filePath,
          line: pos.line + 1,
          column: pos.column + 1,
          context,
        });
      }
    }

    sites.push({
      filePath,
      line: range.start.line + 1,
      column: range.start.column + 1,
      context,
      classes: siteClasses,
    });
  }

  const callExpressions = root.root().findAll({ rule: { kind: "call_expression" } });

  for (const call of callExpressions) {
    if (isInsideClassNameAttribute(call)) {
      continue;
    }

    const analysis = analyzeCallExpression(call, classFunctions);
    if (!analysis) {
      continue;
    }

    classSites += 1;
    const range = call.range();

    if (analysis.nonLiteral) {
      nonLiteralSites.push({
        filePath,
        line: range.start.line + 1,
        column: range.start.column + 1,
        context,
      });
    }

    const siteClasses: string[] = [];

    for (const fragment of analysis.fragments) {
      const classTokens = splitClassTokens(fragment.text);
      for (const token of classTokens) {
        const pos = offsetToLineColumn(
          fragment.text,
          fragment.startLine,
          fragment.startColumn,
          token.startOffset
        );

        if (token.value.length > 0) {
          siteClasses.push(token.value);
        }

        tokens.push({
          value: token.value,
          filePath,
          line: pos.line + 1,
          column: pos.column + 1,
          context,
        });
      }
    }

    sites.push({
      filePath,
      line: range.start.line + 1,
      column: range.start.column + 1,
      context,
      classes: siteClasses,
    });
  }

  return {
    tokens,
    sites,
    nonLiteralSites,
    classSites,
  };
}

// ============================================================================
// Component Definition Extraction
// ============================================================================

export interface ComponentDefinition {
  name: string;
  filePath: string;
  line: number;
  column: number;
  hasNorthRoleComment: boolean;
  isExported: boolean;
}

/**
 * Extract exported component definitions from source code.
 * Checks for @north-role JSDoc annotations in preceding comments.
 */
export function extractComponentDefinitions(
  source: string,
  filePath: string
): ComponentDefinition[] {
  const root = parse(Lang.Tsx, source);
  const definitions: ComponentDefinition[] = [];

  // Find export statements with function declarations
  const exportStatements = root.root().findAll({ rule: { kind: "export_statement" } });

  for (const exportNode of exportStatements) {
    const range = exportNode.range();
    const startIndex = range.start.index;

    // Look for @north-role in the immediately preceding JSDoc block.
    // Find the previous statement boundary to avoid matching a prior component's comment.
    const precedingText = source.slice(0, startIndex);

    // Find last statement boundary (export, function, class, closing brace/semicolon)
    const boundaryMatch = precedingText.match(
      /(?:export\s|function\s|class\s|[};])(?![\s\S]*(?:export\s|function\s|class\s|[};]))/
    );
    const searchStart = boundaryMatch ? (boundaryMatch.index ?? 0) + boundaryMatch[0].length : 0;
    const commentRegion = precedingText.slice(searchStart);
    const jsDocMatch = commentRegion.match(/\/\*\*[\s\S]*?\*\/\s*$/);
    const hasNorthRoleComment = jsDocMatch ? /@north-role/.test(jsDocMatch[0]) : false;

    // Find the component name from function declaration or variable declaration
    const funcDecl = exportNode.find({ rule: { kind: "function_declaration" } });
    const varDecl = exportNode.find({ rule: { kind: "lexical_declaration" } });

    if (funcDecl) {
      const identifier = funcDecl.find({ rule: { kind: "identifier" } });
      const componentName = identifier?.text() ?? null;

      if (componentName && /^[A-Z]/.test(componentName)) {
        definitions.push({
          name: componentName,
          filePath,
          line: range.start.line + 1,
          column: range.start.column + 1,
          hasNorthRoleComment,
          isExported: true,
        });
      }
    } else if (varDecl) {
      // Handle multi-declaration exports: export const A = () => {}, B = () => {}
      const variableDeclaration =
        varDecl.find({ rule: { kind: "variable_declaration" } }) ?? varDecl;
      const declarators = variableDeclaration.findAll({ rule: { kind: "variable_declarator" } });

      for (const declarator of declarators) {
        const identifier = declarator.find({ rule: { kind: "identifier" } });
        const componentName = identifier?.text() ?? null;

        if (componentName && /^[A-Z]/.test(componentName)) {
          const declRange = declarator.range();
          definitions.push({
            name: componentName,
            filePath,
            line: declRange.start.line + 1,
            column: declRange.start.column + 1,
            hasNorthRoleComment,
            isExported: true,
          });
        }
      }
    }
  }

  return definitions;
}
