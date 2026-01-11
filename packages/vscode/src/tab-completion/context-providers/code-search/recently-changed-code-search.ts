import { getLogger } from "@/lib/logger";
import { injectable, singleton } from "tsyringe";
import * as vscode from "vscode";
import { DocumentSelector } from "../../utils";
import {
  type TextDocumentSnapshot,
  createTextDocumentSnapshot,
} from "../../utils";
import { CodeSearchEngine, type CodeSearchResult } from "./engine";

const logger = getLogger("TabCompletion.RecentlyChangedCodeSearch");

const RecentlyChangedCodeIndexingConfig = {
  checkingChangesInterval: 500,
  changesDebouncingInterval: 1000,
};

const RecentlyChangedCodeChunkingConfig = {
  maxChunks: 100,
  chunkSize: 500,
  overlapLines: 1,
};

@injectable()
@singleton()
export class RecentlyChangedCodeSearch implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];

  private codeSearchEngine = new CodeSearchEngine(
    RecentlyChangedCodeChunkingConfig,
  );
  private indexingWorker: ReturnType<typeof setInterval> | undefined =
    undefined;
  private pendingDocuments: TextDocumentSnapshot[] = [];
  private didChangeTextDocumentEventDebounceMap = new Map<
    string,
    {
      document: TextDocumentSnapshot;
      timer: ReturnType<typeof setTimeout>;
    }
  >();

  constructor() {
    this.indexingWorker = setInterval(async () => {
      while (this.pendingDocuments.length > 0) {
        const document = this.pendingDocuments.shift();
        if (document) {
          logger.trace("Consuming indexing task.");
          await this.codeSearchEngine.index(document);
        }
      }
    }, RecentlyChangedCodeIndexingConfig.checkingChangesInterval);

    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument(async (event) => {
        const { document } = event;
        if (vscode.languages.match(DocumentSelector, document)) {
          this.handleDidChangeTextDocument(event);
        }
      }),
    );
  }

  private handleDidChangeTextDocument(event: vscode.TextDocumentChangeEvent) {
    const contentChanges = event.contentChanges;
    const document = createTextDocumentSnapshot(event.document);
    if (contentChanges.length < 1) {
      return;
    }

    const uriString = document.uri.toString();
    if (this.didChangeTextDocumentEventDebounceMap.has(uriString)) {
      const cached = this.didChangeTextDocumentEventDebounceMap.get(uriString);
      if (cached) {
        clearTimeout(cached.timer);
      }
    }

    // A debouncing to avoid indexing the same document multiple times in a short time
    this.didChangeTextDocumentEventDebounceMap.set(uriString, {
      document,
      timer: setTimeout(() => {
        this.pendingDocuments.push(document);
        this.didChangeTextDocumentEventDebounceMap.delete(uriString);
        logger.trace("Created indexing task:", uriString);
      }, RecentlyChangedCodeIndexingConfig.changesDebouncingInterval),
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
    const indexed = engine.getIndexed();

    const excludedPathString = excludes.map((uri) => uri.toString());
    const filepaths = indexed
      .map((item) => item.document.uri.toString())
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
    if (this.indexingWorker) {
      clearInterval(this.indexingWorker);
      this.indexingWorker = undefined;
    }

    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];
  }
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
