import { dirname, relative, resolve } from "node:path";
import { Lang, type SgNode, parse } from "@ast-grep/napi";

/**
 * Represents a component composition relationship in the component graph.
 * Tracks which components (parents) use which other components (children).
 */
export interface ComponentGraphEntry {
  /** File path of the parent component (relative path) */
  parentFile: string;
  /** Name of the parent component */
  parentComponent: string;
  /** File path of the child component (relative path) */
  childFile: string;
  /** Name of the child component */
  childComponent: string;
  /** Line number where the child component is used */
  line: number;
}

/**
 * Represents a component import statement.
 * Maps local names to original names and source paths.
 */
interface ComponentImport {
  /** Name used in this file (could be aliased) */
  readonly localName: string;
  /** Original exported name from the source file */
  readonly originalName: string;
  /** Import path from the import statement */
  readonly sourcePath: string;
}

/**
 * Derives the component name from a file path.
 * Example: "components/ui/Button.tsx" -> "Button"
 */
function deriveComponentName(filePath: string): string {
  const parts = filePath.split("/");
  const fileName = parts[parts.length - 1] ?? filePath;
  return fileName.replace(/\.(tsx|ts|jsx|js)$/, "");
}

/**
 * Resolves a relative import path to an absolute path.
 * Example: "./Button" from "components/Card.tsx" -> "components/Button.tsx"
 */
function resolveImportPath(importPath: string, currentFilePath: string): string {
  if (!importPath.startsWith(".")) {
    // Not a relative import - return as-is (node_modules import)
    return importPath;
  }

  const currentDir = dirname(currentFilePath);
  const resolved = resolve(currentDir, importPath);
  const normalized = relative("", resolved);

  // Add .tsx extension if no extension present
  if (!/\.(tsx|ts|jsx|js)$/.test(normalized)) {
    return `${normalized}.tsx`;
  }

  return normalized;
}

/**
 * Extracts component imports from the AST.
 * Handles default imports, named imports, and aliased imports.
 * Skips namespace imports (e.g., import * as Icons).
 */
function extractImports(root: SgNode): Map<string, ComponentImport> {
  const imports = new Map<string, ComponentImport>();
  const importStatements = root.findAll({ rule: { kind: "import_statement" } });

  for (const importStmt of importStatements) {
    const sourceNode = importStmt.find({ rule: { kind: "string" } });
    if (!sourceNode) {
      continue;
    }

    const sourcePath = sourceNode.text().replace(/['"]/g, "");

    const importClause = importStmt.find({ rule: { kind: "import_clause" } });
    if (!importClause) {
      continue;
    }

    // Check for namespace import first: import * as Icons from './icons'
    const namespaceImport = importClause.find({
      rule: { kind: "namespace_import" },
    });
    if (namespaceImport) {
      // Skip namespace imports (JSX uses member expressions like Icons.ChevronRight)
      continue;
    }

    const defaultIdentifier = importClause
      .children()
      .find((child) => child.kind() === "identifier");

    // Handle named imports: import { Button, Card as C } from './components'
    const namedImports = importClause.find({ rule: { kind: "named_imports" } });
    if (namedImports) {
      const importSpecifiers = namedImports.findAll({
        rule: { kind: "import_specifier" },
      });

      for (const specifier of importSpecifiers) {
        const identifiers = specifier
          .findAll({ rule: { kind: "identifier" } })
          .map((node) => node.text());

        if (identifiers.length === 1) {
          // Simple named import: { Button }
          const name = identifiers[0];
          if (name) {
            imports.set(name, {
              localName: name,
              originalName: name,
              sourcePath,
            });
          }
        } else if (identifiers.length === 2) {
          // Aliased import: { Button as Btn }
          const [originalName, localName] = identifiers;
          if (originalName && localName) {
            imports.set(localName, {
              localName,
              originalName,
              sourcePath,
            });
          }
        }
      }
    }

    // Handle default imports: import Button from './Button'
    if (defaultIdentifier) {
      const localName = defaultIdentifier.text();
      imports.set(localName, {
        localName,
        originalName: localName,
        sourcePath,
      });
    }
  }

  return imports;
}

/**
 * Extracts JSX elements from the AST.
 * Only considers components (starting with uppercase letter).
 * Returns both opening elements (<Button>) and self-closing elements (<Icon />).
 */
function extractJsxElements(root: SgNode): Array<{ name: string; line: number }> {
  const elements: Array<{ name: string; line: number }> = [];

  // Find JSX opening elements: <Button>
  const openingElements = root.findAll({
    rule: { kind: "jsx_opening_element" },
  });

  for (const element of openingElements) {
    const identifier = element.find({ rule: { kind: "identifier" } });
    if (identifier) {
      const name = identifier.text();
      // Only consider components (start with uppercase)
      if (name && /^[A-Z]/.test(name)) {
        elements.push({
          name,
          line: element.range().start.line + 1,
        });
      }
    }
  }

  // Find JSX self-closing elements: <Icon />
  const selfClosingElements = root.findAll({
    rule: { kind: "jsx_self_closing_element" },
  });

  for (const element of selfClosingElements) {
    const identifier = element.find({ rule: { kind: "identifier" } });
    if (identifier) {
      const name = identifier.text();
      // Only consider components (start with uppercase)
      if (name && /^[A-Z]/.test(name)) {
        elements.push({
          name,
          line: element.range().start.line + 1,
        });
      }
    }
  }

  return elements;
}

/**
 * Extracts component composition relationships from a TSX source file.
 *
 * Analyzes import statements and JSX usage to build a graph of which components
 * are used by which other components. This enables queries like "what components
 * does Card use?" and "what components use Button?"
 *
 * @param source - TSX source code to analyze
 * @param filePath - Relative path of the file being analyzed
 * @returns Array of component graph entries representing parent-child relationships
 *
 * @example
 * ```typescript
 * const source = `
 *   import { Button } from './Button'
 *   export default function Card() {
 *     return <Button>Click me</Button>
 *   }
 * `;
 * const entries = extractComponentGraph(source, 'components/Card.tsx');
 * // Returns: [{ parentFile: 'components/Card.tsx', parentComponent: 'Card',
 * //            childFile: 'components/Button.tsx', childComponent: 'Button', line: 3 }]
 * ```
 */
export function extractComponentGraph(source: string, filePath: string): ComponentGraphEntry[] {
  const root = parse(Lang.Tsx, source);
  const imports = extractImports(root.root());
  const jsxElements = extractJsxElements(root.root());

  const parentComponent = deriveComponentName(filePath);
  const entries: ComponentGraphEntry[] = [];

  for (const element of jsxElements) {
    const importInfo = imports.get(element.name);
    if (!importInfo) {
      // JSX element is not from an import (might be local or built-in)
      continue;
    }

    const childFile = resolveImportPath(importInfo.sourcePath, filePath);

    entries.push({
      parentFile: filePath,
      parentComponent,
      childFile,
      childComponent: importInfo.originalName,
      line: element.line,
    });
  }

  return entries;
}
