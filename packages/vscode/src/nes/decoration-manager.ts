import { isMultiLine } from "@/code-completion/utils/strings";
import { getLogger } from "@/lib/logger";
import { injectable, singleton } from "tsyringe";
import * as vscode from "vscode";
import { ThemeColor } from "vscode";
import type { NESSolution } from "./solution";

const logger = getLogger("NES.DecorationManager");

@injectable()
@singleton()
export class NESDecorationManager implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];

  private replacementDecorationType =
    vscode.window.createTextEditorDecorationType({
      backgroundColor: new ThemeColor(
        "inlineEdit.originalChangedTextBackground",
      ),
      border: "2px solid",
      borderRadius: "2px",
      borderColor: new ThemeColor("inlineEdit.tabWillAcceptOriginalBorder"),
    });
  private insertionDecorationType =
    vscode.window.createTextEditorDecorationType({});
  private lineEndDecorationType = vscode.window.createTextEditorDecorationType({
    isWholeLine: true,
    after: {
      contentText: "Hover to see edit suggestion",
      color: new ThemeColor("foreground"),
      backgroundColor: new ThemeColor(
        "inlineEdit.modifiedChangedTextBackground",
      ),
      margin: "0 0 0 5px",
      border: "2px solid",
      borderColor: new ThemeColor("focusBorder"),
    },
  });

  private modifiedTextDecorationOptions = {
    backgroundColor: new ThemeColor("inlineEdit.modifiedChangedTextBackground"),
    border: "2px solid",
    borderRadius: "2px",
    margin: "0 0 0 2px",
    borderColor: new ThemeColor("inlineEdit.tabWillAcceptModifiedBorder"),
  };
  private cursorInsertionDecorationOptions = {
    color: new ThemeColor("editorGhostText.foreground"),
    fontStyle: "italic",
  };

  private current:
    | {
        editor: vscode.TextEditor;
        solution: NESSolution;
      }
    | undefined = undefined;

  show(editor: vscode.TextEditor, solution: NESSolution) {
    const { changes, patch } = solution;

    this.current = { editor, solution };
    vscode.commands.executeCommand(
      "setContext",
      "pochiNextEditSuggestionVisible",
      true,
    );

    const cursorPosition = editor.selection.active;

    const preview = buildPreview(patch);
    const replacements: vscode.DecorationOptions[] = [];
    const insertions: vscode.DecorationOptions[] = [];
    const lineEnds: vscode.DecorationOptions[] = [];

    if (changes.some((c) => isMultiLine(c.text))) {
      // If there are multi-line changes, show a line-end decoration to preview all changes.
      const lineEndPostion = cursorPosition.translate(
        0,
        Number.MAX_SAFE_INTEGER,
      );
      const lineEndDecoration: vscode.DecorationOptions = {
        range: new vscode.Range(lineEndPostion, lineEndPostion),
        hoverMessage: preview,
      };
      lineEnds.push(lineEndDecoration);
    }

    for (const change of changes) {
      if (
        change.range.end.isEqual(cursorPosition) &&
        !isMultiLine(change.text) &&
        editor.document.getText(change.range) ===
          change.text.slice(0, change.rangeLength)
      ) {
        const decoration = {
          range: new vscode.Range(cursorPosition, cursorPosition),
          renderOptions: {
            after: {
              ...this.cursorInsertionDecorationOptions,
              contentText: change.text.slice(change.rangeLength),
            },
          },
        };
        insertions.push(decoration);
      } else {
        const decoration = {
          range: change.range,
          renderOptions:
            change.text.length > 0 && !isMultiLine(change.text)
              ? {
                  after: {
                    ...this.modifiedTextDecorationOptions,
                    contentText: change.text,
                  },
                }
              : {},
        };
        if (change.rangeLength === 0) {
          insertions.push(decoration);
        } else {
          replacements.push(decoration);
        }
      }
    }

    editor.setDecorations(this.replacementDecorationType, replacements);
    editor.setDecorations(this.insertionDecorationType, insertions);
    editor.setDecorations(this.lineEndDecorationType, lineEnds);
  }

  accept() {
    logger.debug("Accepting the current edit suggestion");
    if (!this.current) {
      logger.debug("No current edit suggestion to accept");
      return;
    }
    const { editor, solution } = this.current;
    editor.edit((editBuilder) => {
      for (const change of solution.changes) {
        editBuilder.replace(change.range, change.text);
      }
    });
    this.hide();

    // Move cursor to the end of the last change
    const lastChange = solution.changes[solution.changes.length - 1];
    const cursorPosition = lastChange.range.end.translate(
      0,
      lastChange.text.length - lastChange.rangeLength,
    );
    editor.selection = new vscode.Selection(cursorPosition, cursorPosition);
  }

  reject() {
    logger.debug("Rejecting the current edit suggestion");
    this.hide();
  }

  dismiss() {
    logger.debug("Dismissing the current edit suggestion");
    this.hide();
  }

  private hide() {
    if (!this.current) {
      logger.debug("No current edit suggestion to hide");
      return;
    }
    const { editor } = this.current;
    editor.setDecorations(this.replacementDecorationType, []);
    editor.setDecorations(this.insertionDecorationType, []);
    editor.setDecorations(this.lineEndDecorationType, []);
    this.current = undefined;
    vscode.commands.executeCommand(
      "setContext",
      "pochiNextEditSuggestionVisible",
      false,
    );
  }

  dispose() {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];
  }
}

function buildPreview(patch: string) {
  const md = new vscode.MarkdownString();
  md.appendMarkdown(
    "**Suggestion provided by Pochi, press Tab to accept:**\n\n",
  );
  md.appendMarkdown(
    patch
      // Split by hunk
      .split(/@@ .+ @@/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      // Format each hunk as a code block
      .map((diff) => {
        return `\`\`\`diff\n${diff}\n\`\`\``;
      })
      .join("\n\n"),
  );
  return md;
}
