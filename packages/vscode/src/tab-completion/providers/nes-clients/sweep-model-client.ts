import { logToFileObject } from "@/lib/file-logger";
import { getLogger } from "@/lib/logger";
import { container } from "tsyringe";
import * as vscode from "vscode";
import type { TabCompletionContext } from "../../context";
import { DeclarationSnippetsProvider } from "../../context-providers";
import {
  type CodeSnippet,
  type RangeMapping,
  type TextDocumentSnapshot,
  cropTextToMaxChars,
  deduplicateSnippets,
  getRelativePath,
  isAddingBlankLines,
  isRemovingBlankLines,
  offsetRangeToPositionRange,
  simpleDiff,
} from "../../utils";
import type { Fetcher, RequestBody } from "../fetchers";
import type { TabCompletionProviderResponseItem } from "../types";
import type { TabCompletionProviderClient } from "../types";
import { postprocess } from "./post-process";

const WindowLines = 21;
const MaxCodeSnippets = 5;
const MaxCharsPerCodeSnippet = 2000;
const MaxOutputTokens = 512;
const Temperature = 0.0;
const RequestTimeOut = 60 * 1000;

const logger = getLogger("TabCompletion.Providers.NES.SweepModelClient");

interface BaseSegments {
  filepath: string;

  startOffset: number;
  endOffset: number;

  current: string;
  original: string;

  diffs: {
    filepath: string;
    original: string;
    modified: string;
  }[];
}

interface ExtraSegments {
  codeSnippets?: CodeSnippet[] | undefined;
}

export class NESSweepModelClient
  implements TabCompletionProviderClient<BaseSegments, ExtraSegments>
{
  constructor(
    public readonly id: string,
    private readonly fetcher: Fetcher,
  ) {}

  collectBaseSegments(context: TabCompletionContext): BaseSegments | undefined {
    if (context.selectedCompletionInfo) {
      // mark request invalid as there is selected completion
      return undefined;
    }

    if (!context.editHistory || context.editHistory.length === 0) {
      // no edit history
      return undefined;
    }

    const currentDocument = context.documentSnapshot;
    const filepath = getRelativePath(currentDocument.uri);

    let startOffset: number;
    let endOffset: number;

    if (currentDocument.lineCount <= WindowLines) {
      startOffset = 0;
      endOffset = currentDocument.content.length;
    } else {
      const currentLine = context.selection.active.line;
      const halfWindow = Math.floor(WindowLines / 2);
      let startLine = currentLine - halfWindow;
      let endLine = currentLine + halfWindow;
      if (startLine < 0) {
        endLine -= startLine;
        startLine = 0;
      }
      if (endLine >= currentDocument.lineCount) {
        startLine -= endLine - (currentDocument.lineCount - 1);
        endLine = currentDocument.lineCount - 1;
      }
      startLine = Math.max(0, startLine);

      startOffset = currentDocument.offsetAt(new vscode.Position(startLine, 0));
      endOffset = currentDocument.offsetAt(
        currentDocument.lineAt(endLine).range.end,
      );
    }

    const current = currentDocument.getText(
      offsetRangeToPositionRange(
        { start: startOffset, end: endOffset },
        currentDocument,
      ),
    );

    const editHistory = context.editHistory;
    const lastEdit = editHistory[editHistory.length - 1];

    const originalDocument = lastEdit.getBefore();
    const originalStartOffset = lastEdit.getOffsetBefore(startOffset);
    const originalEndOffset = lastEdit.getOffsetBefore(endOffset);
    const original = originalDocument.getText(
      offsetRangeToPositionRange(
        { start: originalStartOffset, end: originalEndOffset },
        originalDocument,
      ),
    );

    const diffs = editHistory
      .slice(0, -1)
      .map((step) => {
        const before = step.getBefore().getText();
        const after = step.getAfter().getText();
        const diff = simpleDiff(before, after);
        if (diff) {
          return {
            filepath,
            ...diff,
          };
        }
      })
      .filter((diff): diff is NonNullable<typeof diff> => diff !== undefined);

    return {
      filepath,
      startOffset,
      endOffset,
      current,
      original,
      diffs,
    };
  }

  async collectExtraSegments(
    context: TabCompletionContext,
    baseSegments: BaseSegments,
    token?: vscode.CancellationToken | undefined,
  ): Promise<ExtraSegments | undefined> {
    let codeSnippets: CodeSnippet[] = [];
    const declarationSnippetsProvider = container.resolve(
      DeclarationSnippetsProvider,
    );
    try {
      const declarations = await declarationSnippetsProvider.collect(
        {
          uri: context.document.uri,
          range: offsetRangeToPositionRange(
            {
              start: baseSegments.startOffset,
              end: baseSegments.endOffset,
            },
            context.document,
          ),
        },
        MaxCodeSnippets,
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
              score: 0,
            };
          }),
        );
      }
    } catch (error) {
      // ignore errors
    }

    codeSnippets = deduplicateSnippets(codeSnippets);
    codeSnippets = codeSnippets.map((snippet) => ({
      ...snippet,
      text: cropTextToMaxChars(snippet.text, MaxCharsPerCodeSnippet),
    }));
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
    const request: RequestBody = {
      prompt: buildPrompt(baseSegments, extraSegments),
      max_tokens: MaxOutputTokens,
      temperature: Temperature,
      stop: ["<|file_sep|>", "</s>"],
    };

    const result = await this.fetcher.fetchCompletion(
      requestId,
      request,
      token,
      RequestTimeOut,
    );

    if (!result) {
      return undefined;
    }

    const edit = {
      changes: [
        {
          range: {
            start: baseSegments.startOffset,
            end: baseSegments.endOffset,
          },
          text: result.text,
        },
      ],
    };

    const processedEdit = postprocess(
      edit,
      context,
      (
        change: RangeMapping,
        originalDocument: TextDocumentSnapshot,
        modifiedDocument: TextDocumentSnapshot,
      ) => {
        if (
          isAddingBlankLines(change, originalDocument, modifiedDocument) ||
          isRemovingBlankLines(change, originalDocument, modifiedDocument)
        ) {
          return false;
        }

        const changeStartOffset = originalDocument.offsetAt(
          change.original.start,
        );
        const changeEndOffset = originalDocument.offsetAt(change.original.end);
        if (
          changeStartOffset < baseSegments.startOffset ||
          changeStartOffset >= baseSegments.endOffset ||
          changeEndOffset < baseSegments.startOffset ||
          changeEndOffset >= baseSegments.endOffset
        ) {
          return false;
        }

        return true;
      },
    );

    if (!processedEdit) {
      logger.trace(
        "No result after postprocessing.",
        logToFileObject({ requestId }),
      );
      return undefined;
    }

    const output = {
      requestId,
      edit: processedEdit,
    };
    logger.trace("Result:", logToFileObject(output));
    return output;
  }
}

function buildPrompt(
  baseSegments: BaseSegments,
  extraSegments?: ExtraSegments | undefined,
) {
  let prompt = "";
  for (const snippet of extraSegments?.codeSnippets ?? []) {
    prompt += `<|file_sep|>${snippet.filepath}\n`;
    prompt += `${snippet.text}\n`;
  }
  for (const diff of baseSegments.diffs) {
    prompt += `<|file_sep|>${diff.filepath}.diff\n`;
    prompt += "original:\n";
    prompt += `${diff.original}\n`;
    prompt += "updated:\n";
    prompt += `${diff.modified}\n`;
  }
  prompt += `<|file_sep|>original/${baseSegments.filepath}\n`;
  prompt += `${baseSegments.original}\n`;
  prompt += `<|file_sep|>current/${baseSegments.filepath}\n`;
  prompt += `${baseSegments.current}\n`;
  prompt += `<|file_sep|>updated/${baseSegments.filepath}\n`;
  return prompt;
}
