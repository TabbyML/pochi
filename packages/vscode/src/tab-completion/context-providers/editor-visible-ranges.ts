import { LRUCache } from "lru-cache";
import { injectable, singleton } from "tsyringe";
import * as vscode from "vscode";
import { DocumentSelector } from "../utils";

@injectable()
@singleton()
export class EditorVisibleRangesTracker implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];

  private readonly history = new LRUCache<number, vscode.Location>({
    max: 100,
    ttl: 5 * 60 * 1000, // 5 minutes
  });
  private didChangeEditorVisibleRangesEventDebounceMap = new Map<
    vscode.TextEditor,
    {
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  private didChangeEditorVisibleRangesEventDebounceInterval = 100;

  private version = 0;

  constructor() {
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
    for (const visibleRange of editor.visibleRanges) {
      this.version++;
      this.history.set(
        this.version,
        new vscode.Location(editor.document.uri, visibleRange),
      );
    }
  }

  async getHistoryRanges(options?: {
    max?: number;
    excludedUris?: vscode.Uri[];
  }): Promise<vscode.Location[] | undefined> {
    const result: vscode.Location[] = [];
    for (const location of this.history.values()) {
      if (options?.max && result.length >= options.max) {
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
    this.history.clear();
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];
  }
}
