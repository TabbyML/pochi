import { type OffsetRange, isRangeConnected } from "./range";
import {
  type TextDocumentSnapshot,
  createTextDocumentSnapshotWithNewText,
} from "./text-document-snapshot";
import { type TextEdit, applyEdit } from "./text-edit";

// A TextDocumentEditStep represents a group of TextEdit that are continuing edit actions.
export class TextDocumentEditStep {
  private readonly before: TextDocumentSnapshot;
  private readonly edits: TextEdit[] = [];

  private after: TextDocumentSnapshot;
  private lastEditedRanges: OffsetRange[] | undefined = undefined;

  constructor(base: TextDocumentSnapshot, initialEdit: TextEdit) {
    this.before = base;
    this.after = base;
    this.appendEdit(initialEdit);
  }

  getBefore() {
    return this.before;
  }

  getAfter() {
    return this.after;
  }

  getEdits(): readonly TextEdit[] {
    return [...this.edits];
  }

  // return true if appended as continuing edit.
  // return false if the edit is not continuing edit, in which case it is not appended.
  appendEdit(newEdit: TextEdit): boolean {
    if (!this.isContinuingEdit(newEdit)) {
      return false;
    }
    const { text, editedRanges } = applyEdit(this.after.getText(), newEdit);
    this.edits.push(newEdit);
    this.after = createTextDocumentSnapshotWithNewText(this.after, text);
    this.lastEditedRanges = editedRanges;
    return true;
  }

  // check if the newEdit is a continuing edit action. e.g. typing more characters or deleting more characters.
  private isContinuingEdit(newEdit: TextEdit) {
    const lastEditedRanges = this.lastEditedRanges;
    if (lastEditedRanges === undefined) {
      return true;
    }
    return newEdit.changes.every((c) => {
      return lastEditedRanges.some((r) => isRangeConnected(r, c.range));
    });
  }
}
