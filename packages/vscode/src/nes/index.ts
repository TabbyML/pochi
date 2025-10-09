import { AbortError, isCanceledError } from "@/code-completion/utils/errors";
// biome-ignore lint/style/useImportType: needed for dependency injection
import { PochiConfiguration } from "@/integrations/configuration";
import { getLogger } from "@/lib/logger";
import { injectable, singleton } from "tsyringe";
import * as vscode from "vscode";
import { NESCache } from "./cache";
// biome-ignore lint/style/useImportType: needed for dependency injection
import { NESClient } from "./client";
import { DocumentSelector } from "./constants";
import {
  type NESContext,
  calculateNESContextHash,
  extractNESContextSegments,
} from "./contexts";
// biome-ignore lint/style/useImportType: needed for dependency injection
import { NESDecorationManager } from "./decoration-manager";
// biome-ignore lint/style/useImportType: needed for dependency injection
import { EditHistoryTracker } from "./edit-history";
import {
  type NESSolution,
  asInlineCompletionItem,
  calculateSolution,
  isEmptySolution,
} from "./solution";
import type { NESResponseItem } from "./types";

const logger = getLogger("NES.Provider");

@injectable()
@singleton()
export class NESProvider implements vscode.Disposable {
  private readonly cache = new NESCache();
  private readonly inlineCompletionProvider = new NESInlineCompletionProvider();
  private readonly editorListener = new NESEditorListener();

  private disposables: vscode.Disposable[] = [];

  private onGoing:
    | {
        hash: string;
        tokenSource: vscode.CancellationTokenSource;
      }
    | undefined = undefined;

  constructor(
    pochiConfiguration: PochiConfiguration,
    private readonly client: NESClient,
    private readonly editHistoryTracker: EditHistoryTracker,
    private readonly nesDecorationManager: NESDecorationManager,
  ) {
    if (pochiConfiguration.advancedSettings.value.nextEditSuggestion?.enabled) {
      logger.info(
        "Next Edit Suggestion is enabled. This feature is experimental.",
      );
      this.initialize();
    }
  }

  private initialize() {
    this.inlineCompletionProvider.initialize(this, this.nesDecorationManager);
    this.editorListener.initialize(this, this.nesDecorationManager);
    this.disposables.push(this.inlineCompletionProvider, this.editorListener);
  }

  async provideNES(
    document: vscode.TextDocument,
    selection: vscode.Selection,
  ): Promise<NESSolution | undefined> {
    logger.debug("Begin provide NES");

    const editHistory = this.editHistoryTracker.getEditSteps(document);
    if (!editHistory || editHistory.length === 0) {
      logger.debug("The current document is not being edited.");
      return undefined;
    }

    const context: NESContext = {
      document,
      selection,
      editHistory,
    };
    const hash = calculateNESContextHash(context);

    if (this.onGoing?.hash === hash) {
      logger.debug("Request is already ongoing with the same context");
      return;
    }

    // Cancel the ongoing request if not matched
    if (this.onGoing) {
      this.onGoing.tokenSource.cancel();
    }
    this.onGoing = {
      hash,
      tokenSource: new vscode.CancellationTokenSource(),
    };
    const token = this.onGoing.tokenSource.token;

    try {
      // Debounce
      const delay = 100; // 100ms
      await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, delay);
        if (token.isCancellationRequested) {
          clearTimeout(timer);
          reject(new AbortError());
        } else {
          token.onCancellationRequested(() => {
            clearTimeout(timer);
            reject(new AbortError());
          });
        }
      });

      let responseItem: NESResponseItem | undefined = undefined;

      // Check cache or make new request
      const cached = this.cache.get(hash);
      if (cached) {
        logger.debug("Cache hit", cached);
        responseItem = cached;
      } else {
        const result = await this.client.fetchCompletion(
          extractNESContextSegments(context),
          token,
        );
        if (result) {
          this.cache.set(hash, result);
          logger.debug("Result received", result);
          responseItem = result;
        } else {
          logger.debug("No result received");
        }
      }

      if (responseItem) {
        const solution = calculateSolution(context, responseItem);
        logger.debug("Calculated solution", {
          changes: solution.changes,
          editableRegion: solution.editableRegion,
        });
        return isEmptySolution(solution) ? undefined : solution;
      }

      return undefined;
    } catch (error) {
      if (isCanceledError(error)) {
        logger.debug("Request was aborted");
      } else {
        logger.debug("Failed to fetch completion", error);
      }
    } finally {
      if (this.onGoing?.hash === hash) {
        this.onGoing = undefined;
      }
    }
  }

  dispose() {
    if (this.onGoing) {
      this.onGoing.tokenSource.cancel();
      this.onGoing = undefined;
    }
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];
  }
}

class NESInlineCompletionProvider
  implements vscode.InlineCompletionItemProvider, vscode.Disposable
{
  private disposables: vscode.Disposable[] = [];
  private nesProvider: NESProvider | undefined;
  private nesDecorationManager: NESDecorationManager | undefined;

  initialize(
    nesProvider: NESProvider,
    nesDecorationManager: NESDecorationManager,
  ) {
    this.nesProvider = nesProvider;
    this.nesDecorationManager = nesDecorationManager;
    this.disposables.push(
      vscode.languages.registerInlineCompletionItemProvider(
        DocumentSelector,
        this,
      ),
    );
  }

  async provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.InlineCompletionContext,
    _token: vscode.CancellationToken,
  ): Promise<vscode.InlineCompletionItem[]> {
    if (!vscode.languages.match(DocumentSelector, document)) {
      return [];
    }

    if (context.selectedCompletionInfo) {
      // Don't trigger if the dropdown is showing
      return [];
    }

    if (this.nesProvider) {
      logger.debug(
        `Trigger NES from InlineCompletionProvider, document: ${document.uri.toString()}`,
      );
      const solution = await this.nesProvider.provideNES(
        document,
        new vscode.Selection(position, position),
      );
      if (solution) {
        const inlineCompletionItem = asInlineCompletionItem(solution);
        if (inlineCompletionItem) {
          logger.debug(
            `Show result as InlineCompletionItem, insertText: ${inlineCompletionItem.insertText}`,
          );
          return [inlineCompletionItem];
        }
        if (this.nesDecorationManager) {
          logger.debug("Show result as decorations");
          const editor = vscode.window.activeTextEditor;
          if (editor && editor.document === document) {
            this.nesDecorationManager.show(editor, solution);
          }
        }
      }
    }

    return [];
  }

  dispose() {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];
  }
}

class NESEditorListener implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];
  private nesProvider: NESProvider | undefined;
  private nesDecorationManager: NESDecorationManager | undefined;

  initialize(
    nesProvider: NESProvider,
    nesDecorationManager: NESDecorationManager,
  ) {
    this.nesProvider = nesProvider;
    this.nesDecorationManager = nesDecorationManager;
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        logger.trace("ActiveTextEditorChange event", editor);
        this.nesDecorationManager?.dismiss();
      }),
      vscode.window.onDidChangeTextEditorSelection(async (event) => {
        if (
          !vscode.languages.match(DocumentSelector, event.textEditor.document)
        ) {
          return;
        }
        logger.trace("TextEditorSelectionChange event", event);
        this.nesDecorationManager?.dismiss();
        if (
          (event.kind === vscode.TextEditorSelectionChangeKind.Mouse ||
            event.kind === vscode.TextEditorSelectionChangeKind.Keyboard) &&
          event.selections.length > 0 &&
          event.selections.every((s) => !s.isEmpty)
        ) {
          // Trigger when user selects a range with mouse or keyboard
          if (this.nesProvider) {
            logger.debug(
              `Trigger NES from TextEditorSelectionChange, document: ${event.textEditor.document.uri.toString()}`,
            );
            const solution = await this.nesProvider.provideNES(
              event.textEditor.document,
              event.selections[0],
            );
            if (solution && this.nesDecorationManager) {
              logger.debug("Show result as decorations");
              this.nesDecorationManager.show(event.textEditor, solution);
            }
          }
        }
      }),
    );
  }

  dispose() {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];
  }
}
