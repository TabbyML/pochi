// Modified from: https://github.com/TabbyML/tabby/blob/493cef3b3229548175de430dbc7f7e4a092ca507/clients/tabby-agent/src/codeCompletion/index.ts

import { getLogger } from "@/lib/logger";
import { signal } from "@preact/signals-core";
import { injectable, singleton } from "tsyringe";
import * as vscode from "vscode";
import {
  CompletionCache,
  calculateCompletionContextHash,
  generateForwardingContexts,
} from "./cache";
import { CodeCompletionConfig } from "./configuration";
// biome-ignore lint/style/useImportType: needed for dependency injection
import {
  DeclarationSnippetsProvider,
  EditorOptionsProvider,
  EditorVisibleRangesTracker,
  GitContextProvider,
  RecentlyChangedCodeSearch,
  TextDocumentReader,
  WorkspaceContextProvider,
} from "./context-provider";
import {
  type CompletionContext,
  buildCompletionContext,
  extractSegments,
} from "./contexts";
import { CompletionDebouncing, type DebouncingContext } from "./debouncing";
import { LatencyTracker, analyzeMetrics } from "./latency-tracker";
import { postCacheProcess, preCacheProcess } from "./post-process";
import { CompletionSolution } from "./solution";
import {
  type CompletionStatisticsEntry,
  CompletionStatisticsTracker,
} from "./statistics";
import {
  AbortError,
  TimeoutError,
  checkPaymentRequiredError,
  checkSubscriptionRequiredError,
  isCanceledError,
} from "./utils/errors";
import { extractNonReservedWordList, isBlank } from "./utils/strings";
import "./utils/array"; // for mapAsync
// biome-ignore lint/style/useImportType: needed for dependency injection
import { PochiConfiguration } from "@/integrations/configuration";
// biome-ignore lint/style/useImportType: needed for dependency injection
import { CodeCompletionClient } from "./client";
import { DocumentSelector } from "./constants";

const logger = getLogger("CodeCompletion.Provider");

type LatencyIssue = "highTimeoutRate" | "slowResponseTime";

@injectable()
@singleton()
export class CompletionProvider
  implements vscode.InlineCompletionItemProvider, vscode.Disposable
{
  private readonly cache = new CompletionCache();
  private readonly debouncing = new CompletionDebouncing();
  private readonly statisticTracker = new CompletionStatisticsTracker();
  private readonly latencyTracker = new LatencyTracker();

  private autoCancellationTokenSource:
    | vscode.CancellationTokenSource
    | undefined = undefined;

  private submitStatsTimer: ReturnType<typeof setInterval> | undefined =
    undefined;
  private disposables: vscode.Disposable[] = [];

  readonly latencyIssue = signal<LatencyIssue | undefined>(undefined);
  readonly isFetching = signal<boolean>(false);
  readonly requireSubscription = signal<"user" | "team" | undefined>(undefined);
  readonly requirePayment = signal<"user" | "team" | undefined>(undefined);

  constructor(
    private readonly pochiConfiguration: PochiConfiguration,
    private readonly textDocumentReader: TextDocumentReader,
    private readonly workspaceContextProvider: WorkspaceContextProvider,
    private readonly gitContextProvider: GitContextProvider,
    private readonly declarationSnippetsProvider: DeclarationSnippetsProvider,
    private readonly recentlyChangedCodeSearch: RecentlyChangedCodeSearch,
    private readonly editorVisibleRangesTracker: EditorVisibleRangesTracker,
    private readonly editorOptionsProvider: EditorOptionsProvider,
    private readonly client: CodeCompletionClient,
  ) {
    this.initialize();
  }

  private initialize() {
    this.recentlyChangedCodeSearch.initialize();
    this.editorVisibleRangesTracker.initialize();

    this.disposables.push(
      vscode.languages.registerInlineCompletionItemProvider(
        DocumentSelector,
        this,
      ),
    );

    const submitStatsInterval = 1000 * 60 * 10; // 10 minutes
    this.submitStatsTimer = setInterval(() => {
      this.submitCompletionStatistics();
    }, submitStatsInterval);
  }

  async provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    context?: vscode.InlineCompletionContext | undefined,
    token?: vscode.CancellationToken | undefined,
  ): Promise<vscode.InlineCompletionList | null> {
    if (token?.isCancellationRequested) {
      return null;
    }
    const { disabled, disabledLanguages } =
      this.pochiConfiguration.advancedSettings.value.inlineCompletion ?? {};
    if (disabled || disabledLanguages?.includes(document.languageId)) {
      return null;
    }

    try {
      const result = await this.generateCompletions(
        { textDocument: document, position },
        context?.triggerKind === vscode.InlineCompletionTriggerKind.Invoke,
        context?.selectedCompletionInfo,
        token,
      );
      if (!result) {
        return null;
      }
      const list = result.solution.toInlineCompletionList(result.context);
      logger.debug("Provided inline completion items", list.items);

      list.items = list.items.map((item) => {
        return {
          ...item,
          command: {
            title: "Code Completion Accepted",
            command: "pochi.inlineCompletion.onDidAccept",
            arguments: [item],
          },
        };
      });
      return list;
    } catch (error) {
      return null;
    }
  }

  private updateLatencyIssue(
    value: "highTimeoutRate" | "slowResponseTime" | undefined,
  ) {
    if (value) {
      logger.info(`Completion latency issue detected: ${value}.`);
    }
    this.latencyIssue.value = value;
  }

  private updateIsFetching(value: boolean) {
    this.isFetching.value = value;
  }

  private updateRequireSubscription(value: "user" | "team" | undefined) {
    this.requireSubscription.value = value;
  }

  private updateRequirePayment(value: "user" | "team" | undefined) {
    this.requirePayment.value = value;
  }

  private submitCompletionStatistics() {
    const report = this.statisticTracker.report();
    if (report.completion_request.count > 0) {
      logger.info("Code completion statistics report:", report);
      this.statisticTracker.reset();
    }
  }

  private async fetchExtraContext(
    context: CompletionContext,
    solution: CompletionSolution,
    timeout?: number | undefined,
    token?: vscode.CancellationToken | undefined,
  ): Promise<void> {
    const config = CodeCompletionConfig.value.prompt;
    const { document, position } = context;

    const prefixRange = document.validateRange(
      new vscode.Range(
        new vscode.Position(
          Math.max(position.line - config.maxPrefixLines, 0),
          0,
        ),
        position,
      ),
    );

    const fetchWorkspaceContext = async () => {
      try {
        solution.extraContext.workspace =
          await this.workspaceContextProvider.getWorkspaceContext(document.uri);
      } catch (error) {
        logger.debug("Failed to fetch workspace context", error);
      }
    };

    const fetchGitContext = async () => {
      try {
        solution.extraContext.git = await this.gitContextProvider.getContext(
          document.uri,
          token,
        );
      } catch (error) {
        logger.debug("Failed to fetch git context", error);
      }
    };

    const fetchDeclarations = async () => {
      if (config.fillDeclarations.enabled && !prefixRange.isEmpty) {
        logger.debug("Collecting declarations...");
        try {
          solution.extraContext.declarations =
            await this.declarationSnippetsProvider.collect(
              {
                uri: document.uri,
                range: prefixRange,
              },
              config.fillDeclarations.maxSnippets,
              false,
              token,
            );
          logger.debug("Completed collecting declarations.");
        } catch (error) {
          if (!isCanceledError) {
            logger.debug("Failed to collect declarations", error);
          }
        }
      }
    };

    const fetchRecentlyChangedCodeSearchResult = async () => {
      if (
        config.collectSnippetsFromRecentChangedFiles.enabled &&
        !prefixRange.isEmpty
      ) {
        logger.debug("Searching recently changed code...");
        try {
          const prefixText = document.getText(prefixRange);
          const query = extractNonReservedWordList(prefixText);
          solution.extraContext.recentEditCodeSearchResult =
            await this.recentlyChangedCodeSearch.search(
              query,
              [document.uri],
              document.languageId,
              config.collectSnippetsFromRecentChangedFiles.maxSnippets,
            );
          logger.debug("Completed searching recently changed code.");
        } catch (error) {
          logger.debug("Failed to do recently changed code search", error);
        }
      }
    };

    const fetchLastViewedSnippets = async () => {
      if (config.collectSnippetsFromRecentOpenedFiles.enabled) {
        try {
          const ranges = await this.editorVisibleRangesTracker.getHistoryRanges(
            {
              max: config.collectSnippetsFromRecentOpenedFiles.maxSnippets,
              excludedUris: [document.uri],
            },
          );
          solution.extraContext.recentlyViewedCodeSnippets = (
            await ranges?.mapAsync(async (range) => {
              return await this.textDocumentReader.read(
                range.uri,
                range.range,
                token,
              );
            })
          )
            ?.filter((item) => item !== undefined)
            .filter((item) => !isBlank(item.text));
        } catch (error) {
          if (!isCanceledError) {
            logger.debug("Failed to read last viewed snippets.", error);
          }
        }
      }
    };

    const fetchEditorOptions = async () => {
      try {
        solution.extraContext.editorOptions =
          await this.editorOptionsProvider.getEditorOptions(
            document.uri,
            token,
          );
      } catch (error) {
        if (!isCanceledError) {
          logger.debug("Failed to fetch editor options", error);
        }
      }
    };

    await new Promise<void>((resolve, reject) => {
      const disposables: vscode.Disposable[] = [];
      const disposeAll = () => {
        for (const disposable of disposables) {
          disposable.dispose();
        }
      };

      Promise.all([
        fetchWorkspaceContext(),
        fetchGitContext(),
        fetchDeclarations(),
        fetchRecentlyChangedCodeSearchResult(),
        fetchLastViewedSnippets(),
        fetchEditorOptions(),
      ]).then(() => {
        disposeAll();
        resolve();
      });
      // No need to catch Promise.all errors here, as individual fetches handle their errors.

      if (token) {
        if (token.isCancellationRequested) {
          disposeAll();
          reject(new AbortError());
        }
        disposables.push(
          token.onCancellationRequested(() => {
            disposeAll();
            reject(new AbortError());
          }),
        );
      }
      if (timeout) {
        const timer = setTimeout(() => {
          disposeAll();
          reject(new TimeoutError());
        }, timeout);
        disposables.push({
          dispose: () => {
            clearTimeout(timer);
          },
        });
      }
    });
  }

  private async generateCompletions(
    documentPosition: {
      textDocument: vscode.TextDocument;
      position: vscode.Position;
    },
    manually: boolean,
    selectedCompletionInfo?: vscode.SelectedCompletionInfo | undefined,
    token?: vscode.CancellationToken | undefined,
  ): Promise<{
    context: CompletionContext;
    solution: CompletionSolution;
  } | null> {
    logger.debug("Generating completions...");
    const config = CodeCompletionConfig.value;

    // Mutex control
    // auto cancel the last request if a new request comes in
    if (
      this.autoCancellationTokenSource &&
      !this.autoCancellationTokenSource.token.isCancellationRequested
    ) {
      this.autoCancellationTokenSource.cancel();
    }

    const cancellationTokenSource = new vscode.CancellationTokenSource();
    if (token) {
      token.onCancellationRequested(() => cancellationTokenSource.cancel());
    }
    const cancellationToken = cancellationTokenSource.token;
    this.autoCancellationTokenSource = cancellationTokenSource;

    // Build the context
    const { textDocument, position } = documentPosition;

    logger.trace("Building completion context...", {
      uri: textDocument.uri,
    });

    const notebook = vscode.workspace.notebookDocuments.find((notebook) => {
      notebook.getCells().some((cell) => {
        return cell.document.uri.toString() === textDocument.uri.toString();
      });
    });
    const notebookCells = notebook?.getCells().map((cell) => cell.document);

    const context = buildCompletionContext(
      textDocument,
      position,
      selectedCompletionInfo,
      notebookCells,
    );
    logger.trace("Completed Building completion context.");

    const hash = calculateCompletionContextHash(context);
    logger.trace("Completion hash: ", { hash });

    let solution: CompletionSolution | undefined = undefined;
    if (this.cache.has(hash)) {
      solution = this.cache.get(hash);
    }

    const debouncingContext: DebouncingContext = {
      triggerCharacter: context.currentLinePrefix.slice(-1),
      isLineEnd: context.isLineEnd,
      isDocumentEnd: !!context.suffix.match(/^\W*$/),
      manually,
    };

    const latencyStatsList: CompletionStatisticsEntry[] = [];

    try {
      // Resolve solution
      if (solution && (!manually || solution.isCompleted)) {
        // Found cached solution
        // TriggerKind is Automatic, or the solution is completed
        // Return cached solution, do not need to fetch more choices

        // Debounce before continue processing cached solution
        await this.debouncing.debounce(debouncingContext, cancellationToken);
        logger.debug("Completion cache hit.");
      } else if (!manually) {
        // No cached solution
        // TriggerKind is Automatic
        // We need to fetch the first choice

        solution = new CompletionSolution();

        // Debounce before fetching
        const averageResponseTime =
          this.latencyTracker.calculateLatencyStatistics().metrics
            .averageResponseTime;
        await this.debouncing.debounce(
          {
            ...debouncingContext,
            estimatedResponseTime: averageResponseTime,
          },
          cancellationToken,
        );

        try {
          const extraContextTimeout = 500; // 500ms when automatic trigger
          logger.debug(
            `Fetching extra completion context with ${extraContextTimeout}ms timeout...`,
          );
          await this.fetchExtraContext(
            context,
            solution,
            extraContextTimeout,
            cancellationToken,
          );
        } catch (error) {
          if (!isCanceledError(error)) {
            logger.debug("Failed to fetch extra context.", error);
          }
        }
        if (cancellationToken.isCancellationRequested) {
          throw new AbortError();
        }

        // Fetch the completion
        logger.debug("Fetching completions from the server...");
        this.updateIsFetching(true);
        try {
          const latencyStats: CompletionStatisticsEntry = {};
          latencyStatsList.push(latencyStats);
          const completionResultItem = await this.client.fetchCompletion(
            extractSegments({
              context,
              extraContexts: solution.extraContext,
            }),
            undefined,
            cancellationToken,
            latencyStats,
          );
          this.updateRequireSubscription(undefined);

          // postprocess: preCache
          const postprocessed = await preCacheProcess(
            [completionResultItem],
            context,
            solution.extraContext,
            config.postprocess,
          );
          solution.addItems(postprocessed);
        } catch (error) {
          if (isCanceledError(error)) {
            logger.debug("Fetching completion canceled.");
            solution = undefined;
          }

          const requiredPayment = checkPaymentRequiredError(error);
          if (requiredPayment) {
            this.updateRequirePayment(requiredPayment);
          } else {
            const requiredSubscription = checkSubscriptionRequiredError(error);
            if (requiredSubscription) {
              this.updateRequireSubscription(requiredSubscription);
            }
          }
        }
      } else {
        // No cached solution, or cached solution is not completed
        // TriggerKind is Manual
        // We need to fetch the more choices

        solution = solution ?? new CompletionSolution();

        // Fetch multiple times to get more choices
        logger.debug("Fetching more completions from the server...");
        this.updateIsFetching(true);

        try {
          logger.debug("Fetching extra completion context...");
          await this.fetchExtraContext(
            context,
            solution,
            undefined,
            cancellationToken,
          );
        } catch (error) {
          if (!isCanceledError(error)) {
            logger.debug("Failed to fetch extra context.", error);
          }
        }
        if (cancellationToken.isCancellationRequested) {
          throw new AbortError();
        }

        try {
          let tries = 0;
          while (
            solution.items.length < config.multiChoice.maxItems &&
            tries < config.multiChoice.maxTries
          ) {
            tries++;
            const latencyStats: CompletionStatisticsEntry = {};
            latencyStatsList.push(latencyStats);
            const completionResultItem = await this.client.fetchCompletion(
              extractSegments({
                context,
                extraContexts: solution.extraContext,
              }),
              config.multiChoice.temperature,
              cancellationToken,
              latencyStats,
            );
            this.updateRequireSubscription(undefined);

            // postprocess: preCache
            const postprocessed = await preCacheProcess(
              [completionResultItem],
              context,
              solution.extraContext,
              config.postprocess,
            );
            solution.addItems(postprocessed);
            if (cancellationToken.isCancellationRequested) {
              throw new AbortError();
            }
          }
          // Mark the solution as completed
          solution.isCompleted = true;
        } catch (error) {
          if (isCanceledError(error)) {
            logger.debug("Fetching completion canceled.");
            solution = undefined;
          }

          const requiredPayment = checkPaymentRequiredError(error);
          if (requiredPayment) {
            this.updateRequirePayment(requiredPayment);
          } else {
            const requiredSubscription = checkSubscriptionRequiredError(error);
            if (requiredSubscription) {
              this.updateRequireSubscription(requiredSubscription);
            }
          }
        }
      }
      // Postprocess solution
      if (solution) {
        // Update Cache
        this.cache.set(hash, solution);

        const forwardingContexts = generateForwardingContexts(
          context,
          solution.items,
        );
        for (const entry of forwardingContexts) {
          const forwardingContextHash = calculateCompletionContextHash(
            entry.context,
          );
          const forwardingSolution = new CompletionSolution();
          forwardingSolution.extraContext = solution.extraContext ?? {};
          forwardingSolution.isCompleted = solution.isCompleted ?? false;
          forwardingSolution.setItems(entry.items);
          this.cache.set(forwardingContextHash, forwardingSolution);
        }

        // postprocess: postCache
        solution.setItems(
          await postCacheProcess(
            solution.items,
            context,
            solution.extraContext,
            config.postprocess,
          ),
        );
        if (cancellationToken.isCancellationRequested) {
          throw new AbortError();
        }
      }
    } catch (error) {
      if (isCanceledError(error)) {
        logger.debug("Providing completions canceled.");
      } else {
        logger.debug("Providing completions failed.", error);
      }
    }

    if (this.autoCancellationTokenSource === cancellationTokenSource) {
      this.autoCancellationTokenSource = undefined;
      this.updateIsFetching(false);
    }

    if (latencyStatsList.length > 0) {
      for (const latencyStatsEntry of latencyStatsList) {
        this.statisticTracker.addStatisticsEntry(latencyStatsEntry);

        if (latencyStatsEntry.latency !== undefined) {
          this.latencyTracker.add(latencyStatsEntry.latency);
        } else if (latencyStatsEntry.timeout) {
          this.latencyTracker.add(Number.NaN);
        }
      }
      const statsResult = this.latencyTracker.calculateLatencyStatistics();
      const issue = analyzeMetrics(statsResult);
      switch (issue) {
        case "healthy":
          this.updateLatencyIssue(undefined);
          break;
        case "highTimeoutRate":
          this.updateLatencyIssue("highTimeoutRate");
          break;
        case "slowResponseTime":
          this.updateLatencyIssue("slowResponseTime");
          break;
      }
    }

    if (solution) {
      this.statisticTracker.addTriggerEntry({
        triggerMode: manually ? "manual" : "auto",
      });
      logger.debug("Completed generating completions.");
      logger.trace("Completion solution:", { items: solution.items });
      return { context, solution };
    }
    return null;
  }

  dispose() {
    this.autoCancellationTokenSource?.dispose();
    this.autoCancellationTokenSource = undefined;

    this.submitCompletionStatistics();
    if (this.submitStatsTimer) {
      clearInterval(this.submitStatsTimer);
      this.submitStatsTimer = undefined;
    }

    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];
  }
}
