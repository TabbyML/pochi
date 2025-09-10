// Modified from: https://github.com/TabbyML/tabby/blob/493cef3b3229548175de430dbc7f7e4a092ca507/clients/tabby-agent/src/codeCompletion/solution.ts

import * as vscode from "vscode";
import type { CompletionContext, CompletionExtraContexts } from "./contexts";
import { isBlank, splitLines } from "./utils/strings";

export class CompletionResultItem {
  // redundant quick access for text
  readonly lines: string[];
  readonly currentLine: string;

  constructor(
    readonly text: string,
    readonly eventId?: {
      completionId: string;
      choiceIndex: number;
    },
  ) {
    this.lines = splitLines(this.text);
    this.currentLine = this.lines[0] ?? "";
  }

  /**
   * Create a new CompletionResultItem from this item with the given text.
   * This method preserves the `eventId` property from the original item.
   * No other properties of the original item are carried over by design.
   */
  withText(text: string): CompletionResultItem {
    return new CompletionResultItem(text, this.eventId);
  }

  toInlineCompletionItem(
    context: CompletionContext,
  ): vscode.InlineCompletionItem | undefined {
    if (isBlank(this.text)) {
      return undefined;
    }

    const position = context.position;
    const insertText = context.selectedCompletionInsertion + this.text;
    return {
      insertText,
      range: new vscode.Range(
        position,
        new vscode.Position(
          position.line,
          position.character + context.lineEndReplaceLength,
        ),
      ),
    };
  }

  isSameWith(other: CompletionResultItem): boolean {
    return this.text === other.text;
  }
}

export class CompletionSolution {
  private resultItems: CompletionResultItem[] = [];

  public extraContext: CompletionExtraContexts = {};
  public isCompleted = false;

  get items(): readonly CompletionResultItem[] {
    return this.resultItems;
  }

  addItems(items: readonly CompletionResultItem[]): void {
    for (const item of items) {
      if (!this.resultItems.some((i) => i.isSameWith(item))) {
        this.resultItems.push(item);
      }
    }
  }

  setItems(items: readonly CompletionResultItem[]): void {
    this.resultItems = [];
    this.addItems(items);
  }

  toInlineCompletionList(
    context: CompletionContext,
  ): vscode.InlineCompletionList {
    return {
      items: this.items
        .map((item) => item.toInlineCompletionItem(context))
        .filter(
          (item): item is vscode.InlineCompletionItem => item !== undefined,
        ),
    };
  }
}

export const emptyCompletionResultItem = new CompletionResultItem("");
