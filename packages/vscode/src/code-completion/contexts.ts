// Modified from: https://github.com/TabbyML/tabby/blob/493cef3b3229548175de430dbc7f7e4a092ca507/clients/tabby-agent/src/codeCompletion/contexts.ts

import path from "node:path";
import { getLogger } from "@/lib/logger";
import * as vscode from "vscode";
import { CodeCompletionConfig } from "./configuration";
import type {
  CodeSearchResult,
  EditorOptionsContext,
  GitContext,
  TextDocumentRangeContext,
  WorkspaceContext,
} from "./context-provider";
import { StaticTextDocument } from "./utils/static-text-document";
import { cropTextToMaxChars, splitLines } from "./utils/strings";

const logger = getLogger("CodeCompletion.Context");

export interface CompletionContext {
  readonly document: vscode.TextDocument;
  readonly position: vscode.Position;
  readonly selectedCompletionInfo?: vscode.SelectedCompletionInfo;
  readonly notebookCells?: vscode.TextDocument[];

  // calculated from selectedCompletionInfo, this insertion text is already included in prefix
  readonly selectedCompletionInsertion: string;

  // the line suffix is empty or should be replaced, in this case, the line suffix is already excluded from suffix
  readonly isLineEnd: boolean;
  readonly lineEndReplaceLength: number;

  // calculated from contexts, do not equal to document prefix and suffix
  readonly prefix: string;
  readonly suffix: string;

  // redundant quick access for prefix and suffix
  readonly prefixLines: string[];
  readonly suffixLines: string[];
  readonly currentLinePrefix: string;
  readonly currentLineSuffix: string;
}

export function buildCompletionContext(
  document: vscode.TextDocument,
  position: vscode.Position,
  selectedCompletionInfo?: vscode.SelectedCompletionInfo,
  notebookCells?: vscode.TextDocument[],
): CompletionContext {
  let selectedCompletionInsertion = "";
  if (selectedCompletionInfo) {
    // Handle selected completion info only if replacement matches prefix
    // Handle: con -> console
    // Ignore: cns -> console
    const replaceRange = selectedCompletionInfo.range;
    if (
      replaceRange.start.line === position.line &&
      replaceRange.start.isBefore(position) &&
      replaceRange.end.isEqual(position)
    ) {
      const replaceLength =
        replaceRange.end.character - replaceRange.start.character;
      selectedCompletionInsertion =
        selectedCompletionInfo.text.substring(replaceLength);
      logger.trace("Used selected completion insertion: ", {
        selectedCompletionInsertion,
      });
    }
  }

  let notebookCellsPrefix = "";
  let notebookCellsSuffix = "";
  if (notebookCells) {
    const currentCellIndex = notebookCells.indexOf(document);
    if (currentCellIndex >= 0 && currentCellIndex < notebookCells.length - 1) {
      const currentLanguageId = document.languageId;
      const formatContext = (cells: vscode.TextDocument[]): string => {
        const notebookLanguageComments: {
          [languageId: string]: (code: string) => string;
        } = {
          // biome-ignore lint/style/useTemplate: <explanation>
          markdown: (code) => "```\n" + code + "\n```",
          python: (code) =>
            code
              .split("\n")
              .map((l) => `# ${l}`)
              .join("\n"),
        };
        return cells
          .map((textDocument) => {
            if (textDocument.languageId === currentLanguageId) {
              return textDocument.getText();
            }
            if (
              Object.keys(notebookLanguageComments).includes(currentLanguageId)
            ) {
              return (
                notebookLanguageComments[currentLanguageId]?.(
                  textDocument.getText(),
                ) ?? ""
              );
            }
            return "";
          })
          .join("\n\n");
      };
      notebookCellsPrefix = `${formatContext(notebookCells.slice(0, currentCellIndex))}\n\n`;
      notebookCellsSuffix = `\n\n${formatContext(notebookCells.slice(currentCellIndex + 1))}`;
      logger.trace("Used notebook cells context:", {
        notebookCellsPrefix,
        notebookCellsSuffix,
      });
    }
  }

  const fullDocumentRange = new vscode.Range(0, 0, document.lineCount, 0);
  const prefixRange = new vscode.Range(fullDocumentRange.start, position);
  const documentPrefix = document.getText(prefixRange);
  const prefix =
    notebookCellsPrefix + documentPrefix + selectedCompletionInsertion;

  const documentCurrentLineSuffixRange = document.validateRange(
    new vscode.Range(position.line, position.character, position.line + 1, 0),
  );
  const documentCurrentLineSuffix = documentCurrentLineSuffixRange.isEmpty
    ? ""
    : document.getText(documentCurrentLineSuffixRange);
  const isLineEnd = !!documentCurrentLineSuffix.match(/^\W*$/);
  const lineEndReplaceLength = isLineEnd
    ? documentCurrentLineSuffix.replace(/\r?\n$/, "").length
    : 0;

  const suffixRange = document.validateRange(
    new vscode.Range(
      new vscode.Position(
        position.line,
        position.character + lineEndReplaceLength,
      ),
      fullDocumentRange.end,
    ),
  );
  const documentSuffix = suffixRange.isEmpty
    ? ""
    : document.getText(suffixRange);

  const suffix = documentSuffix + notebookCellsSuffix;

  const prefixLines = splitLines(prefix);
  const suffixLines = splitLines(suffix);
  const currentLinePrefix = prefixLines[prefixLines.length - 1] ?? "";
  const currentLineSuffix = suffixLines[0] ?? "";

  return {
    document,
    position,
    selectedCompletionInfo,
    notebookCells,
    selectedCompletionInsertion,
    isLineEnd,
    lineEndReplaceLength,
    prefix,
    suffix,
    prefixLines,
    suffixLines,
    currentLinePrefix,
    currentLineSuffix,
  };
}

export function buildCompletionContextWithAppend(
  context: CompletionContext,
  appendText: string,
): CompletionContext {
  const offset = context.document.offsetAt(context.position);
  const updatedText = context.prefix + appendText + context.suffix;
  const updatedOffset = offset + appendText.length;
  const updatedDocument = new StaticTextDocument(
    context.document.uri,
    context.document.languageId,
    context.document.version + 1,
    updatedText,
  );
  const updatedPosition = updatedDocument.positionAt(updatedOffset);
  return buildCompletionContext(
    updatedDocument,
    updatedPosition,
    undefined,
    context.notebookCells,
  );
}

export interface CompletionExtraContexts {
  workspace?: WorkspaceContext;
  git?: GitContext;
  declarations?: TextDocumentRangeContext[];
  recentEditCodeSearchResult?: CodeSearchResult;
  recentlyViewedCodeSnippets?: TextDocumentRangeContext[];
  editorOptions?: EditorOptionsContext;
}

interface CodeSnippets {
  filepath: string;
  language: string;
  text: string;
  score: number; // range 0-1
  kind: "declaration" | "recent_edit" | "recent_viewed";
  range?: vscode.Range; // for deduplication, undefined means whole file
}

export interface CompletionContextSegments {
  prefix: string;
  suffix?: string;
  filepath: string;
  language: string;
  gitUrl?: string;
  codeSnippets?: CodeSnippets[];
}

function mergeText(
  text1: string,
  text2: string,
  range1: vscode.Range,
  range2: vscode.Range,
): string {
  let first = text1;
  let second = text2;
  if (range1.start.isAfter(range2.start)) {
    first = text2;
    second = text1;
  }
  const overlap = range1.intersection(range2);
  if (!overlap || overlap.isEmpty) {
    return `${first}\n${second}`;
  }

  const overlappedLines = overlap.end.line - overlap.start.line;
  const overlappedCharsInLastLine =
    overlappedLines > 0
      ? overlap.end.character
      : overlap.end.character - overlap.start.character;
  const croppedSecond = second
    .split("\n")
    .slice(overlappedLines)
    .map((line, index) =>
      index === 0 ? line.slice(overlappedCharsInLastLine) : line,
    )
    .join("\n");
  return first + croppedSecond;
}

function deduplicateSnippets(snippets: CodeSnippets[]): CodeSnippets[] {
  return snippets.reduce((acc, current) => {
    const next: CodeSnippets[] = [];
    const sameDocumentSnippets: CodeSnippets[] = [];
    for (const snippet of acc) {
      if (snippet.filepath === current.filepath) {
        sameDocumentSnippets.push(snippet);
      } else {
        next.push(snippet);
      }
    }
    const sortedSameDocumentSnippets = sameDocumentSnippets.sort((a, b) => {
      if (!a.range) return -1;
      if (!b.range) return 1;
      return a.range.start.isBefore(b.range.start) ? -1 : 1;
    });
    let newSnippet = { ...current };
    for (const snippet of sortedSameDocumentSnippets) {
      if (!snippet.range) {
        newSnippet = {
          ...snippet,
          score: Math.max(snippet.score, current.score),
        };
      } else if (!current.range) {
        newSnippet = {
          ...current,
          kind: snippet.kind, // keep kind of the earlier snippet
          score: Math.max(snippet.score, current.score),
        };
      } else {
        const intersectionRange = snippet.range.intersection(current.range);
        if (intersectionRange && !intersectionRange.isEmpty) {
          const mergedRange = snippet.range.union(current.range);
          newSnippet = {
            ...snippet,
            range: mergedRange,
            text: mergeText(
              snippet.text,
              current.text,
              snippet.range,
              current.range,
            ),
            kind: snippet.kind, // keep kind of the earlier snippet
            score: Math.max(snippet.score, current.score),
          };
        } else {
          // no intersection, keep it
          next.push(snippet);
        }
      }
    }
    next.push(newSnippet);
    return next;
  }, [] as CodeSnippets[]);
}

function getMaxCharsPerSnippet(kind: CodeSnippets["kind"]): number {
  const config = CodeCompletionConfig.value.prompt;
  if (kind === "declaration") {
    return config.fillDeclarations.maxCharsPerSnippet;
  }
  if (kind === "recent_edit") {
    return config.collectSnippetsFromRecentChangedFiles.maxCharsPerSnippet;
  }
  if (kind === "recent_viewed") {
    return config.collectSnippetsFromRecentOpenedFiles.maxCharsPerSnippet;
  }
  return 500;
}

export function extractSegments(params: {
  context: CompletionContext;
  extraContexts: CompletionExtraContexts;
}): CompletionContextSegments {
  const { context, extraContexts } = params;
  const config = CodeCompletionConfig.value.prompt;

  // prefix && suffix
  const prefix = context.prefixLines
    .slice(Math.max(context.prefixLines.length - config.maxPrefixLines, 0))
    .join("");
  const suffix = context.suffixLines.slice(0, config.maxSuffixLines).join("");

  // language
  const language = context.document.languageId;

  // filepath && git_url
  let relativeRootUri: vscode.Uri | undefined = undefined;
  let gitUrl: string | undefined = undefined;
  if (extraContexts.git?.repository) {
    // find remote url: origin > upstream > first
    const repo = extraContexts.git.repository;
    const remote =
      repo.remotes?.find((remote) => remote.name === "origin") ||
      repo.remotes?.find((remote) => remote.name === "upstream") ||
      repo.remotes?.[0];
    if (remote) {
      relativeRootUri = repo.root;
      gitUrl = remote.url;
    }
  }

  // if relativeFilepathRoot is not set by git context, use path relative to workspace
  if (!relativeRootUri && extraContexts.workspace) {
    relativeRootUri = extraContexts.workspace.uri;
  }
  const relativeRootPath = relativeRootUri?.toString();
  const convertToRelativePath = (uri: vscode.Uri): string => {
    const uriString = uri.toString();
    if (relativeRootPath && uriString.startsWith(relativeRootPath)) {
      return path.relative(relativeRootPath, uriString);
    }
    return uriString;
  };

  const filepath = convertToRelativePath(context.document.uri);

  // snippets: declarations
  const declarations: CodeSnippets[] = [];
  for (const item of extraContexts.declarations ?? []) {
    if (declarations.length >= config.fillDeclarations.maxSnippets) {
      break;
    }
    declarations.push({
      kind: "declaration",
      filepath: convertToRelativePath(item.uri),
      language: item.language,
      text: item.text,
      score: 1,
      range: item.range,
    });
  }

  // snippets: search result from recently edited code
  const recentEditCodeSnippets: CodeSnippets[] = [];
  for (const item of extraContexts.recentEditCodeSearchResult ?? []) {
    if (
      recentEditCodeSnippets.length >=
      config.collectSnippetsFromRecentChangedFiles.maxSnippets
    ) {
      break;
    }
    recentEditCodeSnippets.push({
      kind: "recent_edit",
      filepath: convertToRelativePath(item.uri),
      language: item.language,
      text: item.text,
      score: item.score,
      range: item.range,
    });
  }

  // snippets: last viewed ranges
  const recentlyViewedSnippets: CodeSnippets[] = [];
  for (const item of extraContexts.recentlyViewedCodeSnippets ?? []) {
    if (
      recentlyViewedSnippets.length >=
      config.collectSnippetsFromRecentOpenedFiles.maxSnippets
    ) {
      break;
    }
    recentlyViewedSnippets.push({
      kind: "recent_viewed",
      filepath: convertToRelativePath(item.uri),
      language: item.language,
      text: item.text,
      score: 0.5,
      range: item.range,
    });
  }

  // merge and deduplicate snippets
  let codeSnippets = deduplicateSnippets([
    ...declarations,
    ...recentEditCodeSnippets,
    ...recentlyViewedSnippets,
  ]);
  // crop snippets to max chars
  codeSnippets = codeSnippets.map((snippet) => ({
    ...snippet,
    text: cropTextToMaxChars(snippet.text, getMaxCharsPerSnippet(snippet.kind)),
  }));

  // sort snippets by score desc
  codeSnippets = codeSnippets.sort((a, b) => b.score - a.score);

  return {
    prefix,
    suffix,
    filepath,
    language,
    gitUrl,
    codeSnippets,
  };
}
