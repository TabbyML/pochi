import { StaticTextDocument } from "@/code-completion/utils/static-text-document";
import { getLogger } from "@/lib/logger";
import { LRUCache } from "lru-cache";
import { injectable, singleton } from "tsyringe";
import * as vscode from "vscode";
import { DocumentSelector } from "./constants";
// biome-ignore lint/style/useImportType: needed for dependency injection
import { GitStateMonitor } from "./git/git-state";
import type { TextContentChange } from "./types";

const logger = getLogger("NES.EditHistory");

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

  constructor(private readonly gitStateMonitor: GitStateMonitor) {
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
      this.gitStateMonitor.onDidChangeGitState((e) => {
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

  getEdits(document: vscode.TextDocument): TextDocumentEditStep[] | undefined {
    const tracker = this.documents.get(document.uri.toString());
    return tracker?.getEdits();
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
  private baseSnapshot: vscode.TextDocument;
  private history: TextDocumentEditStep[] = [];
  private paused = false;

  constructor(private readonly textDocument: vscode.TextDocument) {
    this.baseSnapshot =
      textDocument.getText().length > DocumentSizeThresholdToDisableHistory
        ? new StaticTextDocument(textDocument.uri, "", 0, "") // empty document
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

    const edit: SingleEdit = event.contentChanges;
    if (edit.length === 0) {
      return;
    }

    const patchSize = edit.reduce((acc, change) => {
      return acc + change.text.length;
    }, 0);
    if (patchSize > EditSizeThresholdToResetHistory) {
      this.reset();
      return;
    }

    if (this.history.length > 0) {
      const lastStep = this.history[this.history.length - 1];
      if (lastStep.isContinuingEdit(edit)) {
        lastStep.appendEdit(edit, event.document);
      } else {
        this.history.push(
          new TextDocumentEditStep(lastStep.getAfter(), event.document, [edit]),
        );
      }
    } else {
      this.history.push(
        new TextDocumentEditStep(this.baseSnapshot, event.document, [edit]),
      );
    }

    if (this.history.length > MaxEditHistoryStepsPerDocument) {
      this.history.shift();
      this.baseSnapshot = this.history[0].getBefore();
    }
  }

  reset() {
    this.baseSnapshot =
      this.textDocument.getText().length > DocumentSizeThresholdToDisableHistory
        ? new StaticTextDocument(this.textDocument.uri, "", 0, "") // empty document
        : createTextDocumentSnapshot(this.textDocument);
    this.history = [];
  }

  pause() {
    this.paused = true;
  }

  resume() {
    this.paused = false;
  }

  getEdits(): TextDocumentEditStep[] {
    return this.history;
  }

  dispose() {
    logger.debug(`Disposing edit history tracker for ${this.textDocument.uri}`);
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];
    this.history = [];
  }
}

// An edit step represents a group of SingleEdit that are continuing edit actions.
export class TextDocumentEditStep {
  private readonly before: vscode.TextDocument;
  private after: vscode.TextDocument;
  private readonly edits: SingleEdit[] = [];
  constructor(
    base: vscode.TextDocument,
    edited: vscode.TextDocument,
    edits: SingleEdit[],
  ) {
    this.before = createTextDocumentSnapshot(base);
    this.after = createTextDocumentSnapshot(edited);
    this.edits.push(...edits);
  }

  getBefore() {
    return this.before;
  }

  getAfter() {
    return this.after;
  }

  getEdits() {
    return this.edits;
  }

  appendEdit(newEdit: SingleEdit, edited?: vscode.TextDocument) {
    this.after = edited
      ? createTextDocumentSnapshot(edited)
      : applyEdit(this.after, newEdit);
    this.edits.push(newEdit);
  }

  // check if the newEdit is a continuing edit action. e.g. typing more characters or deleting more characters.
  isContinuingEdit(newEdit: SingleEdit) {
    if (this.edits.length === 0) {
      return false;
    }
    const lastRanges = this.edits[this.edits.length - 1].map((e) =>
      calculateRangeAfterEdit(e),
    );
    return newEdit.every((e) => {
      return lastRanges.some((r) => isEditRangeContinuing(r, e.range));
    });
  }
}

// A SingleEdit represents a single edit action.
// A SingleEdit may contain multiple change ranges, e.g. renaming a variable, auto formatting, or using multi-cursor.
// Change ranges should not be overlapping with each other.
type SingleEdit = readonly TextContentChange[];

function createTextDocumentSnapshot(document: vscode.TextDocument) {
  return new StaticTextDocument(
    document.uri,
    "", // languageId should not be used in document history
    0, // version should not be used
    document.getText(),
  );
}

function applyEdit(document: vscode.TextDocument, edit: SingleEdit) {
  const original = document.getText();
  const sortedChanges = edit.toSorted((a, b) => {
    return a.rangeOffset - b.rangeOffset;
  });
  let text = "";
  let index = 0;
  for (const changes of sortedChanges) {
    text += original.slice(index, changes.rangeOffset) + changes.text;
    index = changes.rangeOffset + changes.rangeLength;
  }
  text += original.slice(index);
  return new StaticTextDocument(
    document.uri,
    "", // languageId should not be used in document history
    0, // version should not be used
    text,
  );
}

function calculateRangeAfterEdit(edit: TextContentChange): vscode.Range {
  const range = edit.range;
  const lines = edit.text.split("\n");
  const lastLine = lines[lines.length - 1];
  const newRange = new vscode.Range(
    new vscode.Position(range.start.line, range.start.character),
    new vscode.Position(
      range.start.line + lines.length - 1,
      lines.length === 1
        ? range.start.character + lastLine.length
        : lastLine.length,
    ),
  );
  return newRange;
}

function isEditRangeContinuing(last: vscode.Range, current: vscode.Range) {
  return (
    last.start.isEqual(current.start) ||
    last.end.isEqual(current.end) ||
    last.start.isEqual(current.end) ||
    last.end.isEqual(current.start)
  );
}
