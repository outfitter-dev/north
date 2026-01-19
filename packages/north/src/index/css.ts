export interface CssTokenDefinition {
  name: string;
  value: string;
  filePath: string;
  line: number;
  column: number;
  references: string[];
}

interface LineIndex {
  lineStarts: number[];
}

function buildLineIndex(content: string): LineIndex {
  const lineStarts = [0];
  for (let i = 0; i < content.length; i += 1) {
    if (content[i] === "\n") {
      lineStarts.push(i + 1);
    }
  }
  return { lineStarts };
}

function getLineColumn(index: number, lineIndex: LineIndex): { line: number; column: number } {
  const { lineStarts } = lineIndex;
  let low = 0;
  let high = lineStarts.length - 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const start = lineStarts[mid] ?? 0;
    const next = lineStarts[mid + 1] ?? Number.POSITIVE_INFINITY;

    if (index >= start && index < next) {
      return { line: mid + 1, column: index - start + 1 };
    }

    if (index < start) {
      high = mid - 1;
    } else {
      low = mid + 1;
    }
  }

  return { line: 1, column: index + 1 };
}

const TOKEN_DECLARATION_REGEX = /(--[A-Za-z0-9-_]+)\s*:\s*([^;]+);/g;
const VAR_REFERENCE_REGEX = /var\(\s*(--[A-Za-z0-9-_]+)\s*(?:,[^)]+)?\)/g;

export function parseCssTokens(content: string, filePath: string): CssTokenDefinition[] {
  const tokens: CssTokenDefinition[] = [];
  const lineIndex = buildLineIndex(content);

  TOKEN_DECLARATION_REGEX.lastIndex = 0;
  let match = TOKEN_DECLARATION_REGEX.exec(content);
  while (match) {
    const name = match[1];
    const value = match[2]?.trim() ?? "";
    if (!name) {
      match = TOKEN_DECLARATION_REGEX.exec(content);
      continue;
    }

    const { line, column } = getLineColumn(match.index, lineIndex);
    const references: string[] = [];

    VAR_REFERENCE_REGEX.lastIndex = 0;
    let refMatch = VAR_REFERENCE_REGEX.exec(value);
    while (refMatch) {
      const ref = refMatch[1];
      if (ref) {
        references.push(ref);
      }
      refMatch = VAR_REFERENCE_REGEX.exec(value);
    }

    tokens.push({
      name,
      value,
      filePath,
      line,
      column,
      references: Array.from(new Set(references)).sort(),
    });

    match = TOKEN_DECLARATION_REGEX.exec(content);
  }

  return tokens;
}
