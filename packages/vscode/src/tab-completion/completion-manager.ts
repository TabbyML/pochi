// biome-ignore lint/style/useImportType: needed for dependency injection
import {
  type PochiAdvanceSettings,
  PochiConfiguration,
} from "@/integrations/configuration";
import { getLogger } from "@/lib/logger";
import { signal } from "@preact/signals-core";
import deepEqual from "fast-deep-equal";
import { LRUCache } from "lru-cache";
import { container, injectable, singleton } from "tsyringe";
import * as vscode from "vscode";
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
import { TabCompletionSolution, mergeSolution } from "./solution";
import {
  EditorSelectionTrigger,
  type EditorSelectionTriggerEvent,
  InlineCompletionProviderTrigger,
  type InlineCompletionProviderTriggerEvent,
} from "./triggers";
import { delayFn, isLineEndPosition, toPositionRange } from "./utils";

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
          this.current = undefined;
        }
      }),
      vscode.window.onDidChangeActiveTextEditor(() => {
        if (this.current) {
          this.current.dispose();
          this.current = undefined;
        }
      }),
      vscode.window.onDidChangeTextEditorSelection(
        (e: vscode.TextEditorSelectionChangeEvent) => {
          if (e.textEditor === vscode.window.activeTextEditor && this.current) {
            this.current.dispose();
            this.current = undefined;
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
          toPositionRange(change.range, editor.document),
          change.text,
        );
      }
    });

    // Move cursor to the end of the edited range
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
      editor.selection = new vscode.Selection(
        reducedEditedRange.end,
        reducedEditedRange.end,
      );
    }

    logger.trace("Solution accepted.");
    current.dispose();
    this.current = undefined;
  }

  reject() {
    logger.trace("Reject invoked.");
    if (!this.current) {
      logger.trace("Failed to reject: no current completion.");
      return;
    }
    const current = this.current;
    this.cache.delete(current.solution.context.hash);

    logger.trace("Solution rejected.");
    current.dispose();
    this.current = undefined;
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

    let solution: TabCompletionSolution;
    if (this.cache.has(context.hash)) {
      solution = this.cache.get(context.hash) as TabCompletionSolution;
    } else {
      solution = new TabCompletionSolution(context);
      this.cache.set(context.hash, solution);
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
      logger.trace("Using cached solution, no new requests will be sent.");
      this.handleDidUpdateSolution();
      return;
    }

    logger.trace("Preparing new requests.");
    for (const provider of this.providers) {
      logger.trace(`Create new request for provider ${provider.id}.`);
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
        }),
      });

      const tokenSource = new vscode.CancellationTokenSource();
      const delay = debounce.getDelay({
        triggerCharacter: context.documentSnapshot.getText(
          new vscode.Range(
            context.selection.active.translate(0, -1),
            context.selection.active,
          ),
        ),
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
      });

      const token = tokenSource.token;
      delayFn(
        async () => {
          await request.start(token);
        },
        delay,
        token,
      ).catch(() => {
        logger.trace(`Request for provider ${provider.id} canceled.`);
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
      const item = solution.items[0].inlineCompletionItem;
      logger.trace("Return the first item as inline completion.", item);
      triggerEvent.resolve(new vscode.InlineCompletionList([item]));
      return;
    }

    if (
      triggerEvent.kind === "inline-completion" &&
      triggerEvent.selectedCompletionInfo
    ) {
      return;
    }

    if (this.current.decorationItemIndex === undefined) {
      logger.trace("Show item as decoration.");

      const index = solution.items.length - 1;
      const tokenSource = new vscode.CancellationTokenSource();
      this.current.decorationItemIndex = index;
      this.current.decorationTokenSource = tokenSource;

      vscode.commands.executeCommand("editor.action.inlineSuggest.hide");
      this.decorationManager.show(
        editor,
        solution.items[index],
        tokenSource.token,
      );
    }
  }

  private updateIsFetching() {
    this.isFetching.value =
      this.current?.providerRequests.some(
        (r) => r.request.status.value.type === "processing",
      ) ?? false;
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

  dispose() {
    if ("resolve" in this.triggerEvent) {
      this.triggerEvent.resolve(undefined);
    }
    for (const providerRequest of this.providerRequests) {
      for (const disposable of providerRequest.disposables) {
        disposable.dispose();
      }
      if (providerRequest.tokenSource) {
        providerRequest.tokenSource.cancel();
      }
      providerRequest.request.dispose();
    }
    if (this.decorationTokenSource) {
      this.decorationTokenSource.cancel();
      this.decorationTokenSource.dispose();
    }
  }
}
