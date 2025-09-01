// Modified from: https://github.com/TabbyML/tabby/blob/493cef3b3229548175de430dbc7f7e4a092ca507/clients/tabby-agent/src/contextProviders/editorVisibleRanges.ts

import deepEqual from "fast-deep-equal";
import { LRUCache } from "lru-cache";
import { injectable, singleton } from "tsyringe";
import * as vscode from "vscode";
import { CodeCompletionConfig } from "../configuration";
import { DocumentSelector } from "../constants";

function pickConfig(config: (typeof CodeCompletionConfig)["value"]) {
  return config.prompt.collectSnippetsFromRecentOpenedFiles;
}

@injectable()
@singleton()
export class EditorVisibleRangesTracker implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];

  private currentConfig = pickConfig(CodeCompletionConfig.value);
  private history: LRUCache<number, vscode.Location> | undefined = undefined;
  private version = 0;
  private didChangeEditorVisibleRangesEventDebounceMap = new Map<
    vscode.TextEditor,
    {
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  private didChangeEditorVisibleRangesEventDebounceInterval = 100;

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
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (
          editor &&
          vscode.languages.match(DocumentSelector, editor.document)
        ) {
          this.handleDidChangeEditorVisibleRanges(editor);
        }
      }),
      vscode.window.onDidChangeTextEditorVisibleRanges((event) => {
        if (
          event.textEditor &&
          vscode.languages.match(DocumentSelector, event.textEditor.document)
        ) {
          this.handleDidChangeEditorVisibleRanges(event.textEditor);
        }
      }),
    );
  }

  private start() {
    if (this.currentConfig.enabled) {
      this.history = new LRUCache<number, vscode.Location>({
        max: 100,
        ttl: 5 * 60 * 1000, // 5 minutes
      });
    }
  }

  private stop() {
    this.history = undefined;
  }

  private handleDidChangeEditorVisibleRanges(editor: vscode.TextEditor) {
    const pendingEvent =
      this.didChangeEditorVisibleRangesEventDebounceMap.get(editor);
    if (pendingEvent) {
      clearTimeout(pendingEvent.timer);
    }
    this.didChangeEditorVisibleRangesEventDebounceMap.set(editor, {
      timer: setTimeout(() => {
        this.didChangeEditorVisibleRangesEventDebounceMap.delete(editor);
        this.updateEditorVisibleRangesHistory(editor);
      }, this.didChangeEditorVisibleRangesEventDebounceInterval),
    });
  }

  private updateEditorVisibleRangesHistory(editor: vscode.TextEditor) {
    if (this.history) {
      for (const visibleRange of editor.visibleRanges) {
        this.version++;
        this.history.set(
          this.version,
          new vscode.Location(editor.document.uri, visibleRange),
        );
      }
    }
  }

  getVersion(): number {
    return this.version;
  }

  async getHistoryRanges(options?: {
    max?: number;
    excludedUris?: vscode.Uri[];
  }): Promise<vscode.Location[] | undefined> {
    if (!this.history) {
      return undefined;
    }

    const result: vscode.Location[] = [];
    for (const location of this.history.values()) {
      if (options?.max && result.length >= options?.max) {
        break;
      }
      if (location) {
        if (
          options?.excludedUris
            ?.map((uri) => uri.toString())
            .includes(location.uri.toString())
        ) {
          continue;
        }

        const foundIntersection = result.find(
          (r) =>
            r.uri.toString() === location.uri.toString() &&
            r.range.intersection(location.range),
        );
        if (!foundIntersection) {
          result.push(location);
        }
      }
    }
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
