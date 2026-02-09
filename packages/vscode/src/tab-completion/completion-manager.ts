// biome-ignore lint/style/useImportType: needed for dependency injection
import {
  type PochiAdvanceSettings,
  PochiConfiguration,
} from "@/integrations/configuration";
import { logToFileObject } from "@/lib/file-logger";
import { getLogger } from "@/lib/logger";
import { signal } from "@preact/signals-core";
import deepEqual from "fast-deep-equal";
import { LRUCache } from "lru-cache";
import { container, injectable, singleton } from "tsyringe";
import * as vscode from "vscode";
import { applyQuickFixes } from "./auto-code-actions";
import { TabCompletionContext } from "./context";
import { EditHistoryTracker, initContextProviders } from "./context-providers";
import { TabCompletionDebounce } from "./debounce";
// biome-ignore lint/style/useImportType: needed for dependency injection
import { TabCompletionDecorationManager } from "./decoration-manager";
import { generateForwardCache } from "./forward-cache";
import type {
  TabCompletionProvider,
  TabCompletionProviderRequest,
} from "./providers";
import { TabCompletionProviderFactory } from "./providers/provider-factory";
import {
  type OnDidAcceptInlineCompletionItemParams,
  TabCompletionSolution,
  mergeSolution,
} from "./solution";
import {
  EditorSelectionTrigger,
  type EditorSelectionTriggerEvent,
  InlineCompletionProviderTrigger,
  type InlineCompletionProviderTriggerEvent,
} from "./triggers";
import {
  delayFn,
  isLineEndPosition,
  isPaymentRequiredError,
  isRateLimitExceededError,
  offsetRangeToPositionRange,
} from "./utils";

const logger = getLogger("TabCompletion.TabCompletionManager");

const DefaultProviders = [
  {
    type: "NES:pochi" as const,
  },
  {
    type: "FIM:pochi" as const,
  },
];

@injectable()
@singleton()
export class TabCompletionManager implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];

  private triggers = [
    new EditorSelectionTrigger(),
    new InlineCompletionProviderTrigger(),
  ];
  private providersConfig:
    | NonNullable<PochiAdvanceSettings["tabCompletion"]>["providers"]
    | undefined;
  private providers = [] as TabCompletionProvider[];
  private readonly cache = new LRUCache<string, TabCompletionSolution>({
    max: 100,
    ttl: 5 * 60 * 1000, // 5 minutes,
  });
  private readonly debounce = new TabCompletionDebounce();

  readonly isFetching = signal(false);

  readonly error = signal<string | undefined>();

  private current: TabCompletionManagerContext | undefined = undefined;

  constructor(
    private readonly pochiConfiguration: PochiConfiguration,
    private readonly decorationManager: TabCompletionDecorationManager,
  ) {
    initContextProviders();
    this.decorationManager.initialize();

    for (const trigger of this.triggers) {
      this.disposables.push(
        trigger.onTrigger((event) => {
          this.handleTriggerEvent(event);
        }),
      );
    }

    this.setupProviders(
      pochiConfiguration.advancedSettings.value.tabCompletion?.providers ??
        DefaultProviders,
    );
    this.disposables.push({
      dispose: pochiConfiguration.advancedSettings.subscribe((value) => {
        const newConfig = value.tabCompletion?.providers ?? DefaultProviders;
        if (!deepEqual(newConfig, this.providersConfig)) {
          this.setupProviders(newConfig);
        }
      }),
    });

    this.disposables.push(
      vscode.window.onDidChangeWindowState(() => {
        if (this.current) {
          this.current.dispose();
          this.removeCurrent();
        }
      }),
      vscode.window.onDidChangeActiveTextEditor(() => {
        if (this.current) {
          this.current.dispose();
          this.removeCurrent();
        }
      }),
      vscode.window.onDidChangeTextEditorSelection(
        (e: vscode.TextEditorSelectionChangeEvent) => {
          if (
            e.textEditor === vscode.window.activeTextEditor &&
            this.current &&
            e.selections.length > 0 &&
            !e.selections[0].isEqual(this.current.triggerEvent.selection)
          ) {
            this.current.dispose();
            this.removeCurrent();
          }
        },
      ),
    );
  }

  private setupProviders(
    providersConfig: NonNullable<
      NonNullable<PochiAdvanceSettings["tabCompletion"]>["providers"]
    >,
  ) {
    const list = [] as TabCompletionProvider[];
    const providerFactory = container.resolve(TabCompletionProviderFactory);
    for (const providerConfig of providersConfig) {
      const provider = providerFactory.createProvider(providerConfig);
      if (provider) {
        list.push(provider);
      }
    }

    this.providersConfig = providersConfig;
    this.providers = list;
  }

  async accept() {
    logger.trace("Accept invoked.");
    if (!this.current) {
      logger.trace("Failed to accept: no current completion.");
      return;
    }
    const current = this.current;
    const { solution, decorationItemIndex } = current;
    if (decorationItemIndex === undefined) {
      logger.trace("Failed to accept: no decoration item index.");
      return;
    }
    const solutionItem = solution.items[decorationItemIndex];

    const editor = vscode.window.activeTextEditor;
    if (
      !editor ||
      editor.document.uri.toString() !==
        solution.context.document.uri.toString()
    ) {
      logger.trace("Failed to accept: active editor mismatch.");
      return;
    }
    await editor.edit((editBuilder) => {
      for (const change of solutionItem.textEdit.changes) {
        editBuilder.replace(
          offsetRangeToPositionRange(change.range, editor.document),
          change.text,
        );
      }
    });

    const reducedEditedRange = solutionItem.diff.changes.reduce<
      vscode.Range | undefined
    >((acc, curr) => {
      const editedRange = curr.innerChanges.reduce<vscode.Range | undefined>(
        (a, c) => {
          return a ? a.union(c.modified) : c.modified;
        },
        undefined,
      );
      return acc ? (editedRange ? acc.union(editedRange) : acc) : editedRange;
    }, undefined);
    if (reducedEditedRange) {
      await applyQuickFixes(editor.document.uri, reducedEditedRange, {
        hash: solution.context.hash,
        requestId: solutionItem.responseItem.requestId,
      });

      // Move cursor to the end of the edited range
      editor.selection = new vscode.Selection(
        reducedEditedRange.end,
        reducedEditedRange.end,
      );
    }

    logger.debug(
      "Solution accepted.",
      logToFileObject({
        hash: solution.context.hash,
        requestId: solutionItem.responseItem.requestId,
      }),
    );
    current.dispose();
    if (this.current === current) {
      this.removeCurrent();
    }
  }

  reject() {
    logger.trace("Reject invoked.");
    vscode.commands.executeCommand("editor.action.inlineSuggest.hide");

    if (!this.current) {
      logger.trace("Failed to reject: no current completion.");
      return;
    }
    const current = this.current;
    const { solution, decorationItemIndex } = current;
    const solutionItem = solution.items[decorationItemIndex ?? 0];

    this.cache.delete(current.solution.context.hash);

    logger.debug(
      "Solution rejected.",
      logToFileObject({
        hash: solution.context.hash,
        requestId: solutionItem.responseItem.requestId,
      }),
    );
    current.dispose();
    if (this.current === current) {
      this.removeCurrent();
    }
  }

  async handleDidAcceptInlineCompletion(
    params: OnDidAcceptInlineCompletionItemParams,
  ) {
    // Apply auto-import quick fixes after code completion is accepted
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      if (params.rangeAfter) {
        await applyQuickFixes(editor.document.uri, params.rangeAfter, {
          hash: params.hash,
          requestId: params.requestId,
        });
      }
    }

    logger.debug(
      "Solution accepted via inline completion.",
      logToFileObject({
        hash: params.hash,
        requestId: params.requestId,
      }),
    );
  }

  private async handleTriggerEvent(
    event: EditorSelectionTriggerEvent | InlineCompletionProviderTriggerEvent,
  ) {
    logger.trace("Handling trigger event.");
    if (event.token?.isCancellationRequested) {
      return;
    }

    // cleanup previous
    if (this.current) {
      this.current.dispose();
      this.current = undefined;
      this.updateIsFetching();
    }

    // check config
    const config = this.pochiConfiguration.advancedSettings.value.tabCompletion;
    const disabled = config?.disabled;
    if (disabled) {
      logger.trace("TabCompletion is disabled.");
      return undefined;
    }

    const disabledLanguages = config?.disabledLanguages ?? [];
    if (disabledLanguages.includes(event.document.languageId)) {
      logger.trace("TabCompletion is disabled by language setting.");
      return undefined;
    }

    const conflictDetected =
      this.pochiConfiguration.githubCopilotCodeCompletionEnabled.value;
    if (conflictDetected) {
      logger.trace(
        "TabCompletion is unavailable due to conflict with GitHub Copilot.",
      );
      return undefined;
    }

    // create context solution
    const editHistoryTracker = container.resolve(EditHistoryTracker);
    const editHistory = editHistoryTracker.getEditSteps(event.document);

    const notebook = vscode.workspace.notebookDocuments.find((notebook) => {
      notebook.getCells().some((cell) => {
        return cell.document.uri.toString() === event.document.uri.toString();
      });
    });
    const notebookCells = notebook?.getCells().map((cell) => cell.document);

    const context = new TabCompletionContext(
      event.document,
      event.selection,
      event.selectedCompletionInfo,
      editHistory,
      notebookCells,
      event.kind === "inline-completion" ? event.isManually : false,
    );

    logger.debug(
      "TabCompletion triggered.",
      logToFileObject({ hash: context.hash }),
    );

    let solution: TabCompletionSolution;
    if (this.cache.has(context.hash)) {
      solution = this.cache.get(context.hash) as TabCompletionSolution;
      logger.trace(
        "Using cache.",
        logToFileObject({
          hash: context.hash,
          solutionItemsLength: solution.items.length,
        }),
      );
    } else {
      solution = new TabCompletionSolution(context);
      this.cache.set(context.hash, solution);
      logger.trace("Create solution.", logToFileObject({ hash: context.hash }));
    }

    // create requests
    const debounce = this.debounce;
    debounce.trigger();
    const providerRequests = [] as {
      request: TabCompletionProviderRequest;
      tokenSource: vscode.CancellationTokenSource;
      disposables: vscode.Disposable[];
    }[];
    const current = new TabCompletionManagerContext(
      event,
      solution,
      providerRequests,
    );
    this.current = current;

    if (!context.isManually && solution.items.length > 0) {
      logger.trace(
        "No new requests will be sent.",
        logToFileObject({ hash: context.hash }),
      );
      this.handleDidUpdateSolution();
      return;
    }

    const offset = context.documentSnapshot.offsetAt(context.selection.active);
    const triggerCharacter = context.documentSnapshot.getText(
      offsetRangeToPositionRange(
        {
          start: Math.max(0, offset - 1),
          end: offset,
        },
        context.documentSnapshot,
      ),
    );
    for (const provider of this.providers) {
      logger.trace(
        `Create new request for provider ${provider.client.id}.`,
        logToFileObject({ hash: context.hash }),
      );
      const request = provider.createRequest(context);
      if (!request) {
        continue;
      }

      const disposables = [] as vscode.Disposable[];
      disposables.push({
        dispose: request.status.subscribe((status) => {
          this.updateIsFetching();

          if (status.type === "finished" && status.response) {
            solution.addItem(status.response);
            this.handleDidUpdateSolution();

            // update forward cache
            const forward = generateForwardCache(
              solution,
              solution.items.length - 1,
            );
            for (const item of forward) {
              logger.trace(
                "Generated forward cache: ",
                logToFileObject({ hash: item.context.hash }),
              );
              if (this.cache.has(item.context.hash)) {
                const prev = this.cache.get(
                  item.context.hash,
                ) as TabCompletionSolution;
                this.cache.set(item.context.hash, mergeSolution(prev, item));
              } else {
                this.cache.set(item.context.hash, item);
              }
            }
          }

          if (status.type === "error" && status.error) {
            // handle with 429 and 402
            if (
              isRateLimitExceededError(status.error) ||
              isPaymentRequiredError(status.error)
            ) {
              this.updateError(status.error.message);
            }
          } else {
            this.updateError(undefined);
          }
        }),
      });

      const tokenSource = new vscode.CancellationTokenSource();
      const estimatedResponseTime =
        request.status.value.type === "init"
          ? request.status.value.estimatedResponseTime
          : 0;
      const delay = debounce.getDelay({
        triggerCharacter:
          triggerCharacter.length === 1 ? triggerCharacter : undefined,
        isLineEnd: isLineEndPosition(
          context.selection.active,
          context.documentSnapshot,
        ),
        isDocumentEnd: !!context.documentSnapshot
          .getText(
            new vscode.Range(
              context.selection.active,
              new vscode.Position(context.documentSnapshot.lineCount, 0),
            ),
          )
          .match(/^\W*$/),
        isManually: context.isManually,
        estimatedResponseTime,
      });

      const token = tokenSource.token;
      delayFn(
        () => {
          request.start(token);
        },
        delay,
        token,
      ).catch(() => {
        logger.trace(
          `Request ${request.id} canceled before starting.`,
          logToFileObject({ hash: context.hash }),
        );
      });
      providerRequests.push({ request, tokenSource, disposables });
    }
    this.updateIsFetching();
  }

  private handleDidUpdateSolution() {
    logger.trace("Handling did update solution.");
    if (!this.current) {
      return;
    }
    const { triggerEvent, solution } = this.current;
    if (solution.items.length === 0) {
      return;
    }

    const editor = vscode.window.activeTextEditor;
    if (
      editor?.document.uri.toString() !==
      solution.context.document.uri.toString()
    ) {
      return;
    }

    if (
      triggerEvent.kind === "inline-completion" &&
      solution.items.length === 1 &&
      solution.items[0].inlineCompletionItem
    ) {
      const inlineCompletionItem = solution.items[0].inlineCompletionItem;
      const { command, ...inlineCompletionItemLogObject } =
        inlineCompletionItem;
      this.current.logFullContext();
      logger.debug(
        "Show item as inline completion.",
        logToFileObject({
          inlineCompletionItem: inlineCompletionItemLogObject,
          hash: solution.context.hash,
          requestId: solution.items[0].responseItem.requestId,
        }),
      );
      triggerEvent.resolve(
        new vscode.InlineCompletionList([inlineCompletionItem]),
      );
      return;
    }

    if (
      triggerEvent.kind === "inline-completion" &&
      triggerEvent.selectedCompletionInfo
    ) {
      return;
    }

    if (this.current.decorationItemIndex === undefined) {
      const index = solution.items.length - 1;
      const tokenSource = new vscode.CancellationTokenSource();
      this.current.decorationItemIndex = index;
      this.current.decorationTokenSource = tokenSource;
      const item = solution.items[index];

      vscode.commands.executeCommand("editor.action.inlineSuggest.hide");

      this.current.logFullContext();
      logger.debug(
        "Show item as decoration.",
        logToFileObject({
          item: item.textEdit,
          hash: solution.context.hash,
          requestId: item.responseItem.requestId,
        }),
      );
      this.decorationManager.show(editor, item, tokenSource.token);
    }
  }

  private removeCurrent() {
    this.current = undefined;
    this.updateIsFetching();
    this.updateError(undefined);
  }

  private updateIsFetching() {
    this.isFetching.value =
      this.current?.providerRequests.some(
        (r) => r.request.status.value.type === "processing",
      ) ?? false;
  }

  private updateError(error: string | undefined) {
    this.error.value = error;
  }

  dispose() {
    for (const trigger of this.triggers) {
      trigger.dispose();
    }
    this.triggers = [];

    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];
  }
}

class TabCompletionManagerContext implements vscode.Disposable {
  decorationItemIndex: number | undefined;
  decorationTokenSource: vscode.CancellationTokenSource | undefined;

  private shouldLogContext = true;

  constructor(
    readonly triggerEvent:
      | EditorSelectionTriggerEvent
      | InlineCompletionProviderTriggerEvent,
    readonly solution: TabCompletionSolution,
    readonly providerRequests: {
      request: TabCompletionProviderRequest;
      tokenSource: vscode.CancellationTokenSource;
      disposables: readonly vscode.Disposable[];
    }[],
  ) {}

  logFullContext() {
    if (!this.shouldLogContext) {
      return;
    }
    this.shouldLogContext = false;
    this.solution.context.logFullContext();
  }

  dispose() {
    if ("resolve" in this.triggerEvent) {
      this.triggerEvent.resolve(undefined);
    }
    for (const providerRequest of this.providerRequests) {
      if (providerRequest.tokenSource) {
        providerRequest.tokenSource.cancel();
      }
      providerRequest.request.dispose();
      for (const disposable of providerRequest.disposables) {
        disposable.dispose();
      }
    }
    if (this.decorationTokenSource) {
      this.decorationTokenSource.cancel();
      this.decorationTokenSource.dispose();
    }
  }
}
