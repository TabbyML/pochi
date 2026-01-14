/**
 * Get the comment character for a specific programming language.
 * @param language The programming language to get the comment character for.
 * @returns The comment character for the specified language.
 */
export function getLanguageCommentChar(language: string): string {
  switch (language.toLowerCase()) {
    case "python":
    case "bash":
    case "shell":
    case "yaml":
    case "toml":
      return "#";
    case "javascript":
    case "typescript":
    case "javascriptreact":
    case "typescriptreact":
    case "java":
    case "c":
    case "cpp":
    case "csharp":
    case "go":
    case "rust":
    case "kotlin":
    case "swift":
    case "dart":
      return "//";
    case "html":
    case "xml":
      return "<!--";
    case "css":
    case "scss":
    case "less":
      return "/*";
    case "sql":
      return "--";
    case "lua":
      return "--";
    case "haskell":
      return "--";
    case "erlang":
      return "%";
    default:
      return "//"; // Default to // for other languages
  }
}

export function extractNonReservedWordList(text: string): string {
  const re = /\w+/g;
  return [
    ...new Set(
      text
        .match(re)
        ?.filter(
          (symbol) => symbol.length > 2 && !reservedKeywords.includes(symbol),
        ),
    ).values(),
  ].join(" ");
}

// Keywords appear in the code everywhere, but we don't want to use them for
// matching in code searching.
// Just filter them out before we start using a syntax parser.
const reservedKeywords = [
  // Typescript: https://github.com/microsoft/TypeScript/issues/2536
  "as",
  "any",
  "boolean",
  "break",
  "case",
  "catch",
  "class",
  "const",
  "constructor",
  "continue",
  "debugger",
  "declare",
  "default",
  "delete",
  "do",
  "else",
  "enum",
  "export",
  "extends",
  "false",
  "finally",
  "for",
  "from",
  "function",
  "get",
  "if",
  "implements",
  "import",
  "in",
  "instanceof",
  "interface",
  "let",
  "module",
  "new",
  "null",
  "number",
  "of",
  "package",
  "private",
  "protected",
  "public",
  "require",
  "return",
  "set",
  "static",
  "string",
  "super",
  "switch",
  "symbol",
  "this",
  "throw",
  "true",
  "try",
  "typeof",
  "var",
  "void",
  "while",
  "with",
  "yield",
];

export function getIndentationLevel(line: string, indentation?: string) {
  if (indentation === undefined) {
    return line.match(/^[ \t]*/)?.[0]?.length ?? 0;
  }
  if (indentation === "\t") {
    return line.match(/^\t*/)?.[0].length ?? 0;
  }
  if (indentation.match(/^ *$/)) {
    const spaces = line.match(/^ */)?.[0].length ?? 0;
    return spaces / indentation.length;
  }
  throw new Error(`Invalid indentation: ${indentation}`);
}

// function foo(a) {  // <-- block opening line
//   return a;
// }                  // <-- block closing line
export function isBlockOpeningLine(lines: string[], index: number): boolean {
  if (index < 0 || index >= lines.length - 1) {
    return false;
  }
  return (
    getIndentationLevel(lines[index]) < getIndentationLevel(lines[index + 1])
  );
}

export function isBlockClosingLine(lines: string[], index: number): boolean {
  if (index <= 0 || index > lines.length - 1) {
    return false;
  }
  return (
    getIndentationLevel(lines[index - 1]) > getIndentationLevel(lines[index])
  );
}
