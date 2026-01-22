import { logToFileObject } from "@/lib/file-logger";
import { getLogger } from "@/lib/logger";
import type { LanguageModelV2 } from "@ai-sdk/provider";
import { type CallSettings, type Prompt, generateText } from "ai";
import { createPatch } from "diff";
import { container } from "tsyringe";
import * as vscode from "vscode";
import type { TabCompletionContext } from "../../context";
import { DeclarationSnippetsProvider } from "../../context-providers";
import {
  type CodeSnippet,
  cropTextToMaxChars,
  deduplicateSnippets,
  formatPlaceholders,
  getRelativePath,
  isCanceledError,
  offsetRangeToPositionRange,
} from "../../utils";
import type { TabCompletionProviderResponseItem } from "../types";
import type { TabCompletionProviderClient } from "../types";

const EditableRegionPrefixLine = 5;
const EditableRegionSuffixLine = 5;
const DocumentPrefixLine = 15;
const DocumentSuffixLine = 15;
const MaxCodeSnippets = 5;
const MaxCharsPerCodeSnippet = 2000;
const MaxOutputTokens = 2048;
const RequestTimeOut = 60 * 1000;

const logger = getLogger("TabCompletion.Providers.NES.ChatModelClient");

interface BaseSegments {
  filepath: string;

  offset: number;
  prefixStartOffset: number;
  editableRegionStartOffset: number;
  editableRegionEndOffset: number;
  suffixEndOffset: number;

  prefix: string;
  editableRegionPrefix: string;
  editableRegionSuffix: string;
  suffix: string;

  edits: string[];
}

interface ExtraSegments {
  codeSnippets?: CodeSnippet[] | undefined;
}

export class NESChatModelClient
  implements TabCompletionProviderClient<BaseSegments, ExtraSegments>
{
  constructor(
    public readonly id: string,
    private readonly model: LanguageModelV2,
  ) {}

  collectBaseSegments(context: TabCompletionContext): BaseSegments | undefined {
    const filepath = getRelativePath(context.document.uri);

    if (context.selectedCompletionInfo) {
      // mark request invalid as there is selected completion
      return undefined;
    }

    if (!context.editHistory || context.editHistory.length === 0) {
      // no edit history
      return undefined;
    }

    const edits = context.editHistory.map((step) => {
      const before = step.getBefore().getText();
      const after = step.getAfter().getText();
      if (before === after) {
        return "";
      }
      const patch = createPatch(filepath, before, after, "", "", {
        context: 2,
      });
      // Remove the header lines
      return patch.split("\n").slice(2).join("\n").trim();
    });

    const cursorPosition = context.selection.active;
    const editableRegionStart = new vscode.Position(
      Math.max(0, cursorPosition.line - EditableRegionPrefixLine),
      0,
    );
    const editableRegionEnd = new vscode.Position(
      Math.min(
        context.document.lineCount,
        cursorPosition.line + 1 + EditableRegionSuffixLine,
      ),
      0,
    );
    const documentPrefixStart = new vscode.Position(
      Math.max(0, editableRegionStart.line - DocumentPrefixLine),
      0,
    );
    const documentSuffixEnd = new vscode.Position(
      Math.min(
        context.document.lineCount,
        editableRegionEnd.line + DocumentSuffixLine,
      ),
      0,
    );

    return {
      filepath,

      offset: context.document.offsetAt(cursorPosition),
      prefixStartOffset: context.document.offsetAt(documentPrefixStart),
      editableRegionStartOffset: context.document.offsetAt(editableRegionStart),
      editableRegionEndOffset: context.document.offsetAt(editableRegionEnd),
      suffixEndOffset: context.document.offsetAt(documentSuffixEnd),

      prefix: context.document.getText(
        new vscode.Range(documentPrefixStart, editableRegionStart),
      ),
      editableRegionPrefix: context.document.getText(
        new vscode.Range(editableRegionStart, cursorPosition),
      ),
      editableRegionSuffix: context.document.getText(
        new vscode.Range(cursorPosition, editableRegionEnd),
      ),
      suffix: context.document.getText(
        new vscode.Range(editableRegionEnd, documentSuffixEnd),
      ),

      edits,
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
              start: baseSegments.prefixStartOffset,
              end: baseSegments.suffixEndOffset,
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
    _context: TabCompletionContext,
    baseSegments: BaseSegments,
    extraSegments?: ExtraSegments | undefined,
    token?: vscode.CancellationToken | undefined,
  ): Promise<TabCompletionProviderResponseItem | undefined> {
    const request: CallSettings & Prompt = {
      system: buildSystemPromptTemplate(baseSegments, extraSegments),
      prompt: formatPlaceholders(UserPromptTemplate, {
        filepath: baseSegments.filepath,
        prefix: baseSegments.prefix,
        editableRegionPrefix: baseSegments.editableRegionPrefix,
        editableRegionSuffix: baseSegments.editableRegionSuffix,
        suffix: baseSegments.suffix,
      }),
      maxOutputTokens: MaxOutputTokens,
      stopSequences: ["<|editable_region_end|>"],
    };

    const signals = [AbortSignal.timeout(RequestTimeOut)];
    if (token) {
      const abortController = new AbortController();
      if (token.isCancellationRequested) {
        abortController.abort();
      }
      token.onCancellationRequested(() => abortController.abort());
      signals.push(abortController.signal);
    }
    const combinedSignal = AbortSignal.any(signals);

    try {
      logger.trace(
        "Request:",
        logToFileObject({
          requestId,
          request,
        }),
      );

      const result = await generateText({
        ...request,
        model: this.model,
        abortSignal: combinedSignal,
      });

      logger.trace(
        "Response:",
        logToFileObject({
          requestId,
          response: result.response.body,
        }),
      );

      if (result.finishReason !== "stop") {
        logger.trace(
          "Unexpected finish reason:",
          logToFileObject({ requestId, finishReason: result.finishReason }),
        );
        return undefined;
      }

      const extractedResult = extractResult(result.text, baseSegments);
      if (extractedResult) {
        const output = {
          requestId,
          edit: {
            changes: [
              {
                range: {
                  start: baseSegments.editableRegionStartOffset,
                  end: baseSegments.editableRegionEndOffset,
                },
                text: extractedResult,
              },
            ],
          },
        };
        logger.trace("Result:", logToFileObject(output));
        return output;
      }
    } catch (error) {
      if (isCanceledError(error)) {
        logger.trace("Request canceled.", logToFileObject({ requestId }));
      } else {
        logger.debug("Request failed.", logToFileObject({ requestId, error }));
      }
      throw error; // rethrow error
    }

    logger.trace("No result.", logToFileObject({ requestId }));
    return undefined;
  }
}

function extractResult(text: string, segments: BaseSegments) {
  const startTagIndex = text.indexOf("<|editable_region_start|>");
  if (startTagIndex === -1) {
    // No start tag found
    return undefined;
  }

  const unexpectedEnd = "\n\n```";
  if (text.trimEnd().endsWith(unexpectedEnd)) {
    // Unexpected output end
    return undefined;
  }

  const resultRegionStart = startTagIndex + "<|editable_region_start|>".length;
  const endTagIndex = text.indexOf("<|editable_region_end|>");
  let result =
    endTagIndex === -1
      ? text.slice(resultRegionStart)
      : text.slice(resultRegionStart, endTagIndex);
  result = result.replace("<|user_cursor_is_here|>", "");

  const contextText =
    segments.prefix +
    segments.editableRegionPrefix +
    segments.editableRegionSuffix +
    segments.suffix;
  const duplicationCheckLinesThreshold = 3;
  if (
    result.split("\n").length > duplicationCheckLinesThreshold &&
    contextText.includes(result)
  ) {
    // Duplication detected
    return undefined;
  }

  return result;
}

function buildSystemPromptTemplate(
  baseSegments: BaseSegments,
  extraSegments?: ExtraSegments | undefined,
) {
  let prompt = formatPlaceholders(SystemPromptTemplate, {
    edits: baseSegments.edits.join("\n\n"),
  });
  if (extraSegments?.codeSnippets && extraSegments.codeSnippets.length > 0) {
    const codeSnippets = extraSegments.codeSnippets
      .map((codeSnippet) => {
        return formatPlaceholders("```{{filepath}}\n{{text}}\n```\n\n", {
          filepath: codeSnippet.filepath,
          text: codeSnippet.text,
        });
      })
      .join("");
    prompt += formatPlaceholders(SystemPromptTemplateExtends.codeSnippets, {
      codeSnippets,
    });
  }
  return prompt;
}

const SystemPromptTemplate =
  "You are an AI coding assistant that helps with code completion and editing. You will be given a code snippet with an editable region marked.\nYour task is to complete or modify the code within that region based on the following events that happened in past. \nNOTE: DO NOT undo or revert the user edits. \n\nUser edits:\n\n```diff\n{{edits}}\n```\n";
const SystemPromptTemplateExtends = {
  codeSnippets:
    "\n\nThese are code snippets from other files, which might provide context or examples relevant to the current task: \n\n{{codeSnippets}}\n",
};
const UserPromptTemplate =
  "```{{filepath}}\n{{prefix}}<|editable_region_start|>{{editableRegionPrefix}}<|user_cursor_is_here|>{{editableRegionSuffix}}<|editable_region_end|>{{suffix}}\n```";
