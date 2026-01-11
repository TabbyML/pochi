import type * as vscode from "vscode";
import type { EditorOptionsContext } from "../../context-providers";
import type { CodeSnippet } from "../../utils";

export interface BaseSegments {
  filepath: string;
  language: string;

  selectedCompletionInsertion: string;
  isLineEnd: boolean;
  lineEndReplaceLength: number;

  prefix: string;
  suffix: string;
  prefixLines: string[];
  suffixLines: string[];
  currentLinePrefix: string;
  currentLineSuffix: string;
  prefixCropped: string;
  suffixCropped: string;

  isManually: boolean;
}

export interface ExtraSegments {
  codeSnippets?: CodeSnippet[] | undefined;
  editorOptions?: EditorOptionsContext | undefined;
}

export interface FIMCompletionModel {
  fetchCompletion(
    baseSegments: BaseSegments,
    extraSegments?: ExtraSegments | undefined,
    token?: vscode.CancellationToken | undefined,
  ): Promise<string | undefined>;
}
