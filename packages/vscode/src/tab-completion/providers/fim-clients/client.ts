import { logToFileObject } from "@/lib/file-logger";
import { getLogger } from "@/lib/logger";
import { container } from "tsyringe";
import * as vscode from "vscode";
import type { TabCompletionContext } from "../../context";
import {
  DeclarationSnippetsProvider,
  EditorVisibleRangesTracker,
  RecentlyChangedCodeSearch,
  TextDocumentReader,
} from "../../context-providers";
import {
  AbortError,
  type CodeSnippet,
  type TextChange,
  cropTextToMaxChars,
  deduplicateSnippets,
  extractNonReservedWordList,
  getRelativePath,
  isBlank,
  splitLines,
} from "../../utils";
import type { TabCompletionProviderResponseItem } from "../types";
import type { TabCompletionProviderClient } from "../types";
import {
  MaxCharsPerCodeSnippet,
  MaxCodeSnippets,
  MaxDeclarationCodeSnippets,
  MaxRecentChangedCodeSnippets,
  MaxRecentViewedCodeSnippets,
  PrefixLines,
  SuffixLines,
} from "./config";
import { postprocess } from "./post-process";
import type { BaseSegments, ExtraSegments, FIMCompletionModel } from "./types";

const logger = getLogger("TabCompletion.Providers.FIM.Client");

export class FIMClient
  implements TabCompletionProviderClient<BaseSegments, ExtraSegments>
{
  constructor(
    readonly id: string,
    private readonly model: FIMCompletionModel,
  ) {}

  collectBaseSegments(context: TabCompletionContext): BaseSegments | undefined {
    const document = context.documentSnapshot;
    const position = context.selection.active;
    const filepath = getRelativePath(document.uri);

    const selectedCompletionInfo = context.selectedCompletionInfo;
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

    const notebookCells = context.notebookCells;
    let notebookCellsPrefix = "";
    let notebookCellsSuffix = "";
    if (notebookCells) {
      const currentCellIndex = notebookCells.indexOf(context.document);
      if (currentCellIndex >= 0 && currentCellIndex < notebookCells.length) {
        const currentLanguageId = context.document.languageId;
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
                Object.keys(notebookLanguageComments).includes(
                  currentLanguageId,
                )
              ) {
                return (
                  notebookLanguageComments[textDocument.languageId]?.(
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

    if (isBlank(prefix)) {
      return undefined;
    }

    const currentLine = document.lineAt(position.line);
    const documentCurrentLineSuffixRange = new vscode.Range(
      position,
      currentLine.range.end,
    );
    const documentCurrentLineSuffix = documentCurrentLineSuffixRange.isEmpty
      ? ""
      : document.getText(documentCurrentLineSuffixRange);
    const isLineEnd = !!documentCurrentLineSuffix.match(/^\W*$/);
    const lineEndReplaceLength = isLineEnd
      ? documentCurrentLineSuffix.replace(/\r?\n$/, "").length
      : 0;

    const suffixRange = new vscode.Range(
      new vscode.Position(
        position.line,
        position.character + lineEndReplaceLength,
      ),
      fullDocumentRange.end,
    );
    const documentSuffix = suffixRange.isEmpty
      ? ""
      : document.getText(suffixRange);

    const suffix = documentSuffix + notebookCellsSuffix;

    const prefixLines = splitLines(prefix);
    const suffixLines = splitLines(suffix);
    const currentLinePrefix = prefixLines[prefixLines.length - 1] ?? "";
    const currentLineSuffix = suffixLines[0] ?? "";

    const prefixCropped = prefixLines
      .slice(Math.max(prefixLines.length - PrefixLines, 0))
      .join("");
    const suffixCropped = suffixLines.slice(0, SuffixLines).join("");

    return {
      filepath,
      language: document.languageId,
      selectedCompletionInsertion,
      isLineEnd,
      lineEndReplaceLength,
      prefix,
      suffix,
      prefixLines,
      suffixLines,
      currentLinePrefix,
      currentLineSuffix,
      prefixCropped,
      suffixCropped,
      isManually: !!context.isManually,
    };
  }

  async collectExtraSegments(
    context: TabCompletionContext,
    _baseSegments: BaseSegments,
    token?: vscode.CancellationToken | undefined,
  ): Promise<ExtraSegments | undefined> {
    const document = context.documentSnapshot;
    const position = context.selection.active;
    const prefixRange = document.validateRange(
      new vscode.Range(
        new vscode.Position(Math.max(position.line - PrefixLines, 0), 0),
        position,
      ),
    );

    let codeSnippets: CodeSnippet[] = [];

    const declarationSnippetsProvider = container.resolve(
      DeclarationSnippetsProvider,
    );
    try {
      const declarations = await declarationSnippetsProvider.collect(
        {
          uri: document.uri,
          range: prefixRange,
        },
        MaxDeclarationCodeSnippets,
        true,
        token,
      );
      if (declarations) {
        codeSnippets.push(
          ...declarations.map((snippet) => {
            return {
              language: snippet.language,
              text: snippet.text,
              filepath: getRelativePath(snippet.uri),
              offset: snippet.offset,
              score: 1,
            };
          }),
        );
      }
    } catch (error) {
      // ignore errors
    }

    const recentlyChangedCodeSearch = container.resolve(
      RecentlyChangedCodeSearch,
    );
    try {
      const prefixText = document.getText(prefixRange);
      const query = extractNonReservedWordList(prefixText);
      const recentEditCodeSearchResult = await recentlyChangedCodeSearch.search(
        query,
        [document.uri],
        document.languageId,
        MaxRecentChangedCodeSnippets,
      );
      if (recentEditCodeSearchResult) {
        codeSnippets.push(
          ...recentEditCodeSearchResult.map((item) => {
            return {
              language: item.language,
              text: item.text,
              filepath: getRelativePath(item.uri),
              offset: item.range.start,
              score: item.score,
            };
          }),
        );
      }
    } catch (error) {
      // ignore errors
    }

    const editorVisibleRangesTracker = container.resolve(
      EditorVisibleRangesTracker,
    );
    const textDocumentReader = container.resolve(TextDocumentReader);
    try {
      const ranges = await editorVisibleRangesTracker.getHistoryRanges({
        max: MaxRecentViewedCodeSnippets,
        excludedUris: [document.uri],
      });
      for (const range of ranges ?? []) {
        const result = await textDocumentReader.read(
          range.uri,
          range.range,
          token,
        );
        if (result && !isBlank(result.text)) {
          codeSnippets.push({
            language: result.language,
            text: result.text,
            filepath: getRelativePath(result.uri),
            offset: result.offset,
            score: 0.5,
          });
        }
      }
    } catch (error) {
      // ignore errors
    }

    codeSnippets = deduplicateSnippets(codeSnippets);
    codeSnippets = codeSnippets
      .map((snippet) => ({
        ...snippet,
        text: cropTextToMaxChars(snippet.text, MaxCharsPerCodeSnippet),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, MaxCodeSnippets);
    return {
      codeSnippets,
    };
  }

  async fetchCompletion(
    requestId: string,
    context: TabCompletionContext,
    baseSegments: BaseSegments,
    extraSegments?: ExtraSegments | undefined,
    token?: vscode.CancellationToken | undefined,
  ): Promise<TabCompletionProviderResponseItem | undefined> {
    let text = await this.model.fetchCompletion(
      requestId,
      baseSegments,
      extraSegments,
      token,
    );
    if (!text) {
      logger.trace("No result.", logToFileObject({ requestId }));
      return undefined;
    }

    text = await postprocess(text, context, baseSegments, extraSegments);
    if (token?.isCancellationRequested) {
      throw new AbortError();
    }
    if (!text) {
      logger.trace(
        "No result after postprocessing.",
        logToFileObject({ requestId }),
      );
      return undefined;
    }

    const document = context.documentSnapshot;
    const position = context.selection.active;
    const offset = document.offsetAt(position);
    const change: TextChange = {
      range: {
        start: offset,
        end: offset + baseSegments.lineEndReplaceLength,
      },
      text: baseSegments.selectedCompletionInsertion + text,
    };

    const result = {
      requestId,
      edit: {
        changes: [change],
      },
    };

    logger.trace("Result:", logToFileObject(result));
    return result;
  }
}
