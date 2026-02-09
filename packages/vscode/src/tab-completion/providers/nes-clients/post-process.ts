import { linesDiffComputers } from "vscode-diff";
import type { TabCompletionContext } from "../../context";
import {
  LinesDiffOptions,
  type RangeMapping,
  type TextChange,
  type TextDocumentSnapshot,
  type TextEdit,
  createTextDocumentSnapshotWithApplyEdit,
  getLines,
  toCodeDiff,
  toOffsetRange,
} from "../../utils";

export function postprocess(
  edit: TextEdit,
  context: TabCompletionContext,
  filterFn: (
    change: RangeMapping,
    originalDocument: TextDocumentSnapshot,
    modifiedDocument: TextDocumentSnapshot,
  ) => boolean,
): TextEdit | undefined {
  const document = context.documentSnapshot;
  const editedDocument = createTextDocumentSnapshotWithApplyEdit(
    document,
    edit,
  );
  const diffResult = linesDiffComputers
    .getDefault()
    .computeDiff(
      getLines(document),
      getLines(editedDocument),
      LinesDiffOptions,
    );
  const diff = toCodeDiff(diffResult);

  const changes: TextChange[] = [];
  for (const change of diff.changes) {
    for (const innerChange of change.innerChanges) {
      if (filterFn(innerChange, document, editedDocument)) {
        changes.push({
          range: toOffsetRange(innerChange.original, document),
          text: editedDocument.getText(innerChange.modified),
        });
      }
    }
  }

  if (changes.length < 1) {
    return undefined;
  }

  return {
    changes,
  };
}
