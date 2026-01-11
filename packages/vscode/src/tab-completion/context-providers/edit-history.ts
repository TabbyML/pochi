// biome-ignore lint/style/useImportType: needed for dependency injection
import { GitState } from "@/integrations/git/git-state";
import { getLogger } from "@/lib/logger";
import { LRUCache } from "lru-cache";
import { injectable, singleton } from "tsyringe";
import * as vscode from "vscode";
import {
  DocumentSelector,
  TextDocumentEditStep,
  type TextDocumentSnapshot,
  type TextEdit,
  createTextDocumentSnapshot,
  createTextDocumentSnapshotWithEmptyText,
} from "../utils";

const logger = getLogger("TabCompletion.EditHistory");

@injectable()
@singleton()
export class EditHistoryTracker implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];
  private pauseTimer: NodeJS.Timeout | undefined = undefined;

  private documents: LRUCache<string, TextDocumentEditHistoryTracker> =
    new LRUCache({
      max: 100, // max 100 tracked documents
      ttl: 1 * 60 * 60 * 1000, // 1 hour
      updateAgeOnGet: false,
      updateAgeOnHas: false,
      dispose: (tracker) => {
        tracker.dispose();
      },
    });

  constructor(private readonly gitState: GitState) {
    for (const document of vscode.workspace.textDocuments) {
      this.track(document);
    }

    this.disposables.push(
      vscode.workspace.onDidOpenTextDocument((document) => {
        this.track(document);
      }),
      vscode.workspace.onDidChangeTextDocument((event) => {
        this.track(event.document);
      }),
      vscode.workspace.onDidCloseTextDocument((document) => {
        this.untrack(document);
      }),
      this.gitState.onDidChangeBranch((e) => {
        if (e.type === "branch-changed") {
          logger.debug("Git branch changed, pausing edit history tracking");
          for (const tracker of this.documents.values()) {
            // Reset and pause history tracking on branch change to avoid irrelevant history
            tracker.reset();
            tracker.pause();
          }
          if (this.pauseTimer) {
            clearTimeout(this.pauseTimer);
          }
          this.pauseTimer = setTimeout(() => {
            logger.debug("Resuming edit history tracking after branch change");
            for (const tracker of this.documents.values()) {
              tracker.resume();
            }
            this.pauseTimer = undefined;
          }, 5 * 1000); // pause for 5 seconds
        }
      }),
    );
  }

  private track(document: vscode.TextDocument) {
    if (!vscode.languages.match(DocumentSelector, document)) {
      return;
    }

    if (!this.documents.has(document.uri.toString())) {
      logger.debug(
        `Start tracking edit history for ${document.uri.toString()}`,
      );
      this.documents.set(
        document.uri.toString(),
        new TextDocumentEditHistoryTracker(document),
      );
    }
  }

  private untrack(document: vscode.TextDocument) {
    if (this.documents.has(document.uri.toString())) {
      logger.debug(`Stop tracking edit history for ${document.uri.toString()}`);
      this.documents.delete(document.uri.toString());
    }
  }

  getEditSteps(
    document: vscode.TextDocument,
  ): readonly TextDocumentEditStep[] | undefined {
    const tracker = this.documents.get(document.uri.toString());
    return tracker?.getEditSteps();
  }

  dispose() {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];
  }
}

const DocumentSizeThresholdToDisableHistory = 1_000_000; // characters
const MaxEditHistoryStepsPerDocument = 5;
const EditSizeThresholdToResetHistory = 1000; // characters

export class TextDocumentEditHistoryTracker implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];
  private baseSnapshot: TextDocumentSnapshot;
  private history: TextDocumentEditStep[] = [];
  private paused = false;

  constructor(private readonly textDocument: vscode.TextDocument) {
    this.baseSnapshot =
      textDocument.getText().length > DocumentSizeThresholdToDisableHistory
        ? createTextDocumentSnapshotWithEmptyText(textDocument)
        : createTextDocumentSnapshot(textDocument);

    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((event) => {
        if (event.document.uri.toString() === textDocument.uri.toString()) {
          this.handleDidChangeTextDocument(event);
        }
      }),
    );
  }

  private handleDidChangeTextDocument(event: vscode.TextDocumentChangeEvent) {
    if (this.paused) {
      return;
    }

    if (
      event.document.getText().length > DocumentSizeThresholdToDisableHistory
    ) {
      this.reset();
      return;
    }

    const edit: TextEdit = {
      changes: event.contentChanges.map((c) => {
        return {
          range: { start: c.rangeOffset, end: c.rangeOffset + c.rangeLength },
          text: c.text,
        };
      }),
    };

    if (edit.changes.length === 0) {
      return;
    }

    const editSize = edit.changes.reduce((acc, change) => {
      return acc + change.text.length;
    }, 0);
    if (editSize > EditSizeThresholdToResetHistory) {
      this.reset();
      return;
    }

    if (this.history.length > 0) {
      const lastStep = this.history[this.history.length - 1];
      const appended = lastStep.appendEdit(edit);
      if (!appended) {
        this.history.push(new TextDocumentEditStep(lastStep.getAfter(), edit));
      }
    } else {
      this.history.push(new TextDocumentEditStep(this.baseSnapshot, edit));
    }

    if (this.history.length > MaxEditHistoryStepsPerDocument) {
      this.history.shift();
      this.baseSnapshot = this.history[0].getBefore();
    }
  }

  reset() {
    this.baseSnapshot =
      this.textDocument.getText().length > DocumentSizeThresholdToDisableHistory
        ? createTextDocumentSnapshotWithEmptyText(this.textDocument)
        : createTextDocumentSnapshot(this.textDocument);
    this.history = [];
  }

  pause() {
    this.paused = true;
  }

  resume() {
    this.paused = false;
  }

  getEditSteps(): readonly TextDocumentEditStep[] {
    return [...this.history];
  }

  dispose() {
    logger.debug(
      `Disposing edit history tracker for ${this.textDocument.uri.toString()}`,
    );
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];
    this.history = [];
  }
}
