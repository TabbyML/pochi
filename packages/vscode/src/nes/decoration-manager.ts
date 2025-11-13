import { isMultiLine } from "@/code-completion/utils/strings";
import { getLogger } from "@/lib/logger";
import { injectable, singleton } from "tsyringe";
import * as vscode from "vscode";
// biome-ignore lint/style/useImportType: needed for dependency injection
import { CanvasRenderer } from "./code-renderer/canvas-renderer";
// biome-ignore lint/style/useImportType: needed for dependency injection
import { TextmateThemer } from "./code-renderer/textmate-themer";
import type { NESSolution } from "./solution";

const logger = getLogger("NES.DecorationManager");

@injectable()
@singleton()
export class NESDecorationManager implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];

  constructor(
    private readonly textmateThemer: TextmateThemer,
    private readonly canvasRenderer: CanvasRenderer,
  ) {}

  // Replacement decoration
  // mark removed text with red background, add new text with green background after the removed text
  private replacementDecorationType =
    vscode.window.createTextEditorDecorationType({
      backgroundColor: new vscode.ThemeColor(
        "inlineEdit.originalChangedTextBackground",
      ),
      border: "2px solid",
      borderRadius: "2px",
      borderColor: new vscode.ThemeColor(
        "inlineEdit.tabWillAcceptOriginalBorder",
      ),
    });
  private replacementDecorationOptions = {
    after: {
      backgroundColor: new vscode.ThemeColor(
        "inlineEdit.modifiedChangedTextBackground",
      ),
      border: "2px solid",
      borderRadius: "2px",
      margin: "0 0 0 2px",
      borderColor: new vscode.ThemeColor(
        "inlineEdit.tabWillAcceptModifiedBorder",
      ),
    },
  };

  // Insertion decoration
  // add ghost text after the current cursor position
  private insertionDecorationType =
    vscode.window.createTextEditorDecorationType({});
  private insertionDecorationOptions = {
    after: {
      color: new vscode.ThemeColor("editorGhostText.foreground"),
      fontStyle: "italic",
    },
  };

  // Image decoration
  // preview code after edit
  private imageDecorationType = vscode.window.createTextEditorDecorationType(
    {},
  );
  private imageDecorationOptions = {
    before: {
      backgroundColor: new vscode.ThemeColor("editorSuggestWidget.background"),
      borderColor: new vscode.ThemeColor("widget.border"),
      color: new vscode.ThemeColor("widget.shadow"),
      border: "2px solid",
      margin: "0 0 0 500px; position: absolute; z-index: 10000",
    },
    after: {},
  };

  private current:
    | {
        editor: vscode.TextEditor;
        solution: NESSolution;
      }
    | undefined = undefined;

  async initialize() {
    await Promise.all([
      this.textmateThemer.initialize(),
      this.canvasRenderer.initialize(),
    ]);
  }

  async show(editor: vscode.TextEditor, solution: NESSolution) {
    const { target, change: combinedChange, edit } = solution;
    if (edit.type !== "text-changes") {
      logger.debug(
        `Skipped showing decorations because edit type is not text-changes. (received ${edit.type})`,
      );
      return;
    }

    const { changes } = edit;

    this.current = { editor, solution };
    vscode.commands.executeCommand(
      "setContext",
      "pochiNextEditSuggestionVisible",
      true,
    );

    const cursorPosition = editor.selection.active;

    const replacements: vscode.DecorationOptions[] = [];
    const insertions: vscode.DecorationOptions[] = [];
    const images: vscode.DecorationOptions[] = [];

    if (changes.some((c) => isMultiLine(c.text))) {
      // If there are multi-line changes, show a image decoration to preview all changes.
      const themedDocument = await this.textmateThemer.theme(
        target.getText().split("\n"),
        editor.document.languageId,
      );
      const tokenLines = themedDocument.tokenLines.slice(
        combinedChange.range.start.line,
        combinedChange.range.start.line +
          combinedChange.text.split("\n").length,
      );

      const editedDocumentRanges = edit.editedRanges.map(
        (range) =>
          new vscode.Range(
            target.positionAt(range.offset),
            target.positionAt(range.offset + range.length),
          ),
      );
      const charDecorationRanges = editedDocumentRanges.flatMap((range) => {
        const ranges: { line: number; start: number; end: number }[] = [];
        let line = range.start.line;
        while (line <= range.end.line) {
          const start = line === range.start.line ? range.start.character : 0;
          const end =
            line === range.end.line
              ? range.end.character
              : target.lineAt(line).range.end.character;
          ranges.push({
            line: line - combinedChange.range.start.line,
            start,
            end,
          });
          line++;
        }
        return ranges;
      });

      const imageRenderingInput = {
        padding: 5,
        fontSize: 14,
        lineHeight: 0,

        colorMap: themedDocument.colorMap,
        foreground: themedDocument.foreground,
        background: 0, // use transparent
        tokenLines,

        lineDecorations: [],
        charDecorations: charDecorationRanges.map((range) => {
          return {
            ...range,
            borderColor: "#7aa32333",
            background: "#9ccc2c33",
          };
        }),
      };

      logger.debug("Creating image for decoration.");
      logger.trace("Image rendering input:", imageRenderingInput);
      const image = await this.canvasRenderer.render(imageRenderingInput);
      if (!image) {
        logger.debug("Failed to create image for decoration.");
        return undefined;
      }
      const base64Image = Buffer.from(image).toString("base64");
      const dataUrl = `data:image/png;base64,${base64Image}`;
      logger.debug("Created image for decoration.");
      logger.trace("Image:", dataUrl);

      const imageDecoration: vscode.DecorationOptions = {
        range: new vscode.Range(
          combinedChange.range.start,
          combinedChange.range.start,
        ),
        renderOptions: {
          before: {
            ...this.imageDecorationOptions.before,
            contentIconPath: vscode.Uri.parse(dataUrl),
          },
          after: {},
        },
      };
      images.push(imageDecoration);
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
              ...this.insertionDecorationOptions.after,
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
                    ...this.replacementDecorationOptions.after,
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
    editor.setDecorations(this.imageDecorationType, images);
  }

  async accept() {
    logger.debug("Accepting the current edit suggestion");
    if (!this.current) {
      logger.debug("No current edit suggestion to accept");
      return;
    }
    const { editor, solution } = this.current;
    const { edit } = solution;
    if (edit.type !== "text-changes") {
      return;
    }
    await editor.edit((editBuilder) => {
      for (const change of edit.changes) {
        editBuilder.replace(change.range, change.text);
      }
    });
    this.hide();

    // Move cursor to the end of the last change
    const lastChange = edit.changes[edit.changes.length - 1];
    const cursorPosition = editor.document.positionAt(
      lastChange.rangeOffset + lastChange.text.length,
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
    editor.setDecorations(this.imageDecorationType, []);
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
