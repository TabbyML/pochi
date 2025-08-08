// Modified from: https://github.com/TabbyML/tabby/blob/493cef3b3229548175de430dbc7f7e4a092ca507/clients/tabby-agent/src/contextProviders/recentlyChangedCodeSearch.ts

import { getLogger } from "@/lib/logger";
import deepEqual from "fast-deep-equal";
import { injectable, singleton } from "tsyringe";
import * as vscode from "vscode";
import { CodeCompletionConfig } from "../../configuration";
import { DocumentSelector } from "../../constants";
import { CodeSearchEngine, type CodeSearchResult } from "./engine";
import type { DocumentRange } from "./types";

const logger = getLogger("CodeCompletion.RecentlyChangedCodeSearch");

function pickConfig(config: (typeof CodeCompletionConfig)["value"]) {
  return config.prompt.collectSnippetsFromRecentChangedFiles;
}

function getLanguageFilter(languageId: string): string[] {
  const tsx = [
    "javascript",
    "javascriptreact",
    "typescript",
    "typescriptreact",
  ];
  if (tsx.includes(languageId)) {
    return tsx;
  }
  return [languageId];
}

@injectable()
@singleton()
export class RecentlyChangedCodeSearch implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];

  private currentConfig = pickConfig(CodeCompletionConfig.value);
  private codeSearchEngine: CodeSearchEngine | undefined = undefined;
  private indexingWorker: ReturnType<typeof setInterval> | undefined =
    undefined;
  private pendingDocumentRanges: DocumentRange[] = [];
  private didChangeEventDebouncingCache = new Map<
    string,
    { documentRange: DocumentRange; timer: ReturnType<typeof setTimeout> }
  >();

  initialize() {
    this.start();

    this.disposables.push({
      dispose: CodeCompletionConfig.subscribe((config) => {
        const newConfig = pickConfig(config);
        if (!deepEqual(this.currentConfig, newConfig)) {
          this.stop();
          this.currentConfig = newConfig;
          this.start();
        }
      }),
    });

    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument(async (event) => {
        const { document } = event;
        if (vscode.languages.match(DocumentSelector, document)) {
          this.handleDidChangeTextDocument(event);
        }
      }),
    );
  }

  private start() {
    const config = this.currentConfig;
    if (!config.enabled) {
      logger.info("Recently changed code search is disabled.");
      return;
    }

    const engine = new CodeSearchEngine(config.indexing);
    this.codeSearchEngine = engine;

    this.indexingWorker = setInterval(async () => {
      while (this.pendingDocumentRanges.length > 0) {
        const documentRange = this.pendingDocumentRanges.shift();
        if (documentRange) {
          logger.trace("Consuming indexing task.");
          await engine.index(documentRange);
        }
      }
    }, config.indexing.checkingChangesInterval);
    logger.info("Created code search engine for recently changed files.");
    logger.trace("Created with config.", { config });
  }

  private stop() {
    if (this.indexingWorker) {
      clearInterval(this.indexingWorker);
      this.indexingWorker = undefined;
    }
    this.codeSearchEngine = undefined;
  }

  private handleDidChangeTextDocument(event: vscode.TextDocumentChangeEvent) {
    const { document, contentChanges } = event;
    if (contentChanges.length < 1) {
      return;
    }

    const config = this.currentConfig;
    const uriString = document.uri.toString();
    let ranges: vscode.Range[] = [];
    if (this.didChangeEventDebouncingCache.has(uriString)) {
      const cached = this.didChangeEventDebouncingCache.get(uriString);
      if (cached) {
        ranges.push(cached.documentRange.range);
        clearTimeout(cached.timer);
      }
    }
    ranges = ranges.concat(
      contentChanges
        .map((change) =>
          "range" in change
            ? new vscode.Range(
                change.range.start,
                document.positionAt(
                  document.offsetAt(change.range.start) + change.text.length,
                ),
              )
            : null,
        )
        .filter((range): range is vscode.Range => range !== null),
    );
    const mergedEditedRange = ranges.reduce((a, b) => a.union(b));
    // Expand the range to cropping window
    const expand = new vscode.Range(
      Math.max(0, mergedEditedRange.start.line - config.indexing.prefixLines),
      0,
      Math.min(
        document.lineCount,
        mergedEditedRange.end.line + config.indexing.suffixLines + 1,
      ),
      0,
    );
    const targetRange = document.validateRange(expand);
    if (targetRange.isEmpty) {
      return;
    }

    const documentRange = { document, range: targetRange };
    // A debouncing to avoid indexing the same document multiple times in a short time
    this.didChangeEventDebouncingCache.set(uriString, {
      documentRange,
      timer: setTimeout(() => {
        this.pendingDocumentRanges.push(documentRange);
        this.didChangeEventDebouncingCache.delete(uriString);
        logger.trace("Created indexing task:", {
          document: documentRange.document.uri,
          range: documentRange.range,
        });
      }, config.indexing.changesDebouncingInterval),
    });
  }

  async search(
    query: string,
    excludes: vscode.Uri[],
    language: string,
    limit?: number,
  ): Promise<CodeSearchResult | undefined> {
    const engine = this.codeSearchEngine;
    if (!engine) {
      return undefined;
    }
    const indexedDocumentRange = engine.getIndexedDocumentRange();

    const excludedPathString = excludes.map((uri) => uri.toString());
    const filepaths = indexedDocumentRange
      .map((documentRange) => documentRange.document.uri.toString())
      .filter((filepath) => !excludedPathString.includes(filepath));
    if (filepaths.length < 1) {
      return [];
    }

    const options = {
      filepathsFilter: filepaths,
      languagesFilter: getLanguageFilter(language),
      limit,
    };
    logger.trace("Search in recently changed files", { query, options });
    const result = await engine.search(query, options);
    logger.trace("Search result", { result });
    return result;
  }

  dispose() {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];
    this.stop();
  }
}
