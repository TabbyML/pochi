import { AbortError, isCanceledError } from "@/code-completion/utils/errors";
// biome-ignore lint/style/useImportType: needed for dependency injection
import { PochiConfiguration } from "@/integrations/configuration";
import { getLogger } from "@/lib/logger";
import { signal } from "@preact/signals-core";
import { injectable, singleton } from "tsyringe";
import * as vscode from "vscode";
import { NESCache } from "./cache";
// biome-ignore lint/style/useImportType: needed for dependency injection
import { NESClient } from "./client";
import { DocumentSelector } from "./constants";
import { type NESRequestContext, buildNESRequestContext } from "./contexts";
// biome-ignore lint/style/useImportType: needed for dependency injection
import { NESDecorationManager } from "./decoration-manager";
// biome-ignore lint/style/useImportType: needed for dependency injection
import { EditHistoryTracker } from "./edit-history";
import { NESSolution } from "./solution";
import type { NESResponseItem } from "./types";

const logger = getLogger("NES.Provider");

@injectable()
@singleton()
export class NESProvider implements vscode.Disposable {
  private readonly cache = new NESCache();
  private readonly inlineCompletionProvider = new NESInlineCompletionProvider();
  private readonly editorListener = new NESEditorListener();

  private disposables: vscode.Disposable[] = [];

  readonly fetching = signal<
    | {
        context: NESRequestContext;
        tokenSource: vscode.CancellationTokenSource;
      }
    | undefined
  >(undefined);

  constructor(
    private readonly pochiConfiguration: PochiConfiguration,
    private readonly client: NESClient,
    private readonly editHistoryTracker: EditHistoryTracker,
    private readonly nesDecorationManager: NESDecorationManager,
  ) {
    this.initialize();

    if (pochiConfiguration.advancedSettings.value.nextEditSuggestion?.enabled) {
      logger.info(
        "Next Edit Suggestion is enabled. This feature is experimental.",
      );
    }
  }

  private initialize() {
    this.inlineCompletionProvider.initialize(this, this.nesDecorationManager);
    this.editorListener.initialize(this, this.nesDecorationManager);
    this.disposables.push(this.inlineCompletionProvider, this.editorListener);

    this.nesDecorationManager.initialize();
  }

  async provideNES(
    document: vscode.TextDocument,
    selection: vscode.Selection,
  ): Promise<NESSolution | undefined> {
    const enabled =
      this.pochiConfiguration.advancedSettings.value.nextEditSuggestion
        ?.enabled;
    if (!enabled) {
      logger.debug("NES is not enabled.");
      return undefined;
    }

    logger.debug("Begin provide NES");

    const editHistory = this.editHistoryTracker.getEditSteps(document);
    if (!editHistory || editHistory.length === 0) {
      logger.debug("The current document is not being edited.");
      return undefined;
    }

    const context = buildNESRequestContext({
      document,
      selection,
      editHistory,
    });

    if (this.fetching.value?.context.hash === context.hash) {
      logger.debug("Request is already ongoing with the same context");
      return;
    }

    // Cancel the ongoing request if not matched
    if (this.fetching.value) {
      this.fetching.value.tokenSource.cancel();
      this.fetching.value.tokenSource.dispose();
    }
    const tokenSource = new vscode.CancellationTokenSource();
    const token = tokenSource.token;
    this.fetching.value = {
      context,
      tokenSource,
    };

    try {
      // Debounce
      const delay = 100; // ms
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
      const cached = this.cache.get(context.hash);
      if (cached) {
        logger.debug("Cache hit", cached);
        responseItem = cached;
      } else {
        const result = await this.client.fetchCompletion(
          context.promptSegments,
          token,
        );
        if (result) {
          logger.debug("Result received", result);
          responseItem = result;
        } else {
          logger.debug("No result received");
        }
      }

      if (responseItem) {
        const solution = new NESSolution(context);
        const added = solution.addItem(responseItem);
        if (added) {
          this.cache.set(context.hash, responseItem);
          logger.debug("Result cached", responseItem);
        }
        return solution;
      }

      return undefined;
    } catch (error) {
      if (isCanceledError(error)) {
        logger.debug("Request was aborted");
      } else {
        logger.debug("Failed to fetch completion", error);
      }
    } finally {
      if (this.fetching.value?.context.hash === context.hash) {
        this.fetching.value.tokenSource.dispose();
        this.fetching.value = undefined;
      }
    }
  }

  dispose() {
    if (this.fetching.value) {
      this.fetching.value.tokenSource.cancel();
      this.fetching.value.tokenSource.dispose();
      this.fetching.value = undefined;
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
    context?: vscode.InlineCompletionContext | undefined,
    token?: vscode.CancellationToken | undefined,
  ): Promise<vscode.InlineCompletionList | undefined> {
    this.nesDecorationManager?.dismiss();

    if (token?.isCancellationRequested) {
      return undefined;
    }
    if (!vscode.languages.match(DocumentSelector, document)) {
      return undefined;
    }
    if (context?.selectedCompletionInfo) {
      // Don't trigger if the dropdown is showing
      return undefined;
    }

    if (this.nesProvider) {
      logger.debug(
        `Trigger NES from InlineCompletionProvider, document: ${document.uri.toString()}`,
      );
      const version = document.version;
      const solution = await this.nesProvider.provideNES(
        document,
        new vscode.Selection(position, position),
      );
      if (solution && solution.items.length > 0) {
        // FIXME(zhiming): multi-choice not supported
        const solutionItem = solution.items[0];
        if (solutionItem.inlineCompletionItem) {
          logger.debug(
            `Show result as InlineCompletionItem, insertText: ${solutionItem.inlineCompletionItem.insertText}`,
          );
          return new vscode.InlineCompletionList([
            solutionItem.inlineCompletionItem,
          ]);
        }
        if (this.nesDecorationManager) {
          const editor = vscode.window.activeTextEditor;
          if (
            editor &&
            editor.document === document &&
            editor.document.version === version
          ) {
            logger.debug("Show result as decorations");
            this.nesDecorationManager.show(editor, solutionItem);
          }
        }
      }
    }

    return undefined;
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
      vscode.window.onDidChangeActiveTextEditor(() => {
        this.nesDecorationManager?.dismiss();
      }),
      vscode.window.onDidChangeTextEditorSelection(async (event) => {
        const document = event.textEditor.document;
        if (!vscode.languages.match(DocumentSelector, document)) {
          return;
        }
        this.nesDecorationManager?.dismiss();
        if (
          (event.kind === vscode.TextEditorSelectionChangeKind.Mouse ||
            event.kind === vscode.TextEditorSelectionChangeKind.Keyboard) &&
          event.selections.length > 0 &&
          event.selections.every((r) => document.getText(r).trim().length > 3)
        ) {
          // Trigger when user selects a range with mouse or keyboard
          if (this.nesProvider) {
            logger.debug(
              `Trigger NES from TextEditorSelectionChange, document: ${document.uri.toString()}`,
            );
            const version = document.version;
            const solution = await this.nesProvider.provideNES(
              document,
              event.selections[0],
            );
            if (
              solution &&
              solution.items.length > 0 &&
              this.nesDecorationManager
            ) {
              const editor = vscode.window.activeTextEditor;
              if (
                editor &&
                editor.document === document &&
                editor.document.version === version
              ) {
                logger.debug("Show result as decorations");
                // FIXME(zhiming): multi-choice not supported
                const solutionItem = solution.items[0];
                this.nesDecorationManager.show(event.textEditor, solutionItem);
              }
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
