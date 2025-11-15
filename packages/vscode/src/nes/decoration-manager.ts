import { getLogger } from "@/lib/logger";
import { injectable, singleton } from "tsyringe";
import * as vscode from "vscode";
// biome-ignore lint/style/useImportType: needed for dependency injection
import { CanvasRenderer } from "./code-renderer/canvas-renderer";
// biome-ignore lint/style/useImportType: needed for dependency injection
import { TextmateThemer } from "./code-renderer/textmate-themer";
import type { NESSolutionItem } from "./solution/item";
import { getLines, toPositionRange } from "./utils";
import type { LineNumberRange } from "./types";

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
  // add new text with green background after the removed text
  private insertionDecorationType =
    vscode.window.createTextEditorDecorationType({});
  private insertionDecorationOptions = {
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

  // Cursor Insertion decoration
  // add ghost text after the current cursor position
  private cursorInsertionDecorationType =
    vscode.window.createTextEditorDecorationType({});
  private cursorInsertionDecorationOptions = {
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

  // Insertion mark decoration
  // mark a position where insertion is previewd in image decoration
  private insertionMarkDecorationType =
    vscode.window.createTextEditorDecorationType({
      backgroundColor: new vscode.ThemeColor(
        "inlineEdit.modifiedChangedTextBackground",
      ),
      border: "2px solid",
      borderRadius: "2px",
      borderColor: new vscode.ThemeColor(
        "inlineEdit.tabWillAcceptModifiedBorder",
      ),
    });

  private current:
    | {
        editor: vscode.TextEditor;
        solution: NESSolutionItem;
      }
    | undefined = undefined;

  async initialize() {
    await Promise.all([
      this.textmateThemer.initialize(),
      this.canvasRenderer.initialize(),
    ]);
  }

  async show(editor: vscode.TextEditor, solution: NESSolutionItem) {
    const { context, target, diff } = solution;
    logger.debug("Will show decoration: ", {
      diff,
      original: context.documentContext.document.getText(),
      target: target.getText(),
    });

    const cursorPosition = editor.selection.active;

    const replacements: vscode.DecorationOptions[] = [];
    const insertions: vscode.DecorationOptions[] = [];
    const cursorInsertions: vscode.DecorationOptions[] = [];
    const images: vscode.DecorationOptions[] = [];
    const insertionMarks: vscode.DecorationOptions[] = [];

    if (
      diff.changes.some(
        (c) =>
          c.modified.end - c.modified.start > c.original.end - c.original.start,
      )
    ) {
      // If there are adding-line changes, show a image decoration to preview all changes.
      const themedDocument = await this.textmateThemer.theme(
        getLines(target),
        editor.document.languageId,
      );

      const lineRangeToRender = diff.changes.reduce<
        LineNumberRange | undefined
      >((acc, curr) => {
        if (!acc) {
          return curr.modified;
        }
        return {
          start: Math.min(acc.start, curr.modified.start),
          end: Math.max(acc.end, curr.modified.end),
        };
      }, undefined);

      if (
        !lineRangeToRender ||
        lineRangeToRender.end <= lineRangeToRender.start
      ) {
        logger.debug("Cannot get lineRangeToRender: ", { diff });
        return;
      }

      const tokenLines = themedDocument.tokenLines.slice(
        lineRangeToRender.start,
        lineRangeToRender.end,
      );

      const editedDocumentRanges = diff.changes.flatMap((lineChange) => {
        return lineChange.innerChanges.map((change) => {
          return change.modified;
        });
      });
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
            line: line - lineRangeToRender.start,
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
          lineRangeToRender.start,
          0,
          lineRangeToRender.start,
          0,
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

      for (const lineChange of diff.changes) {
        for (const change of lineChange.innerChanges) {
          if (change.original.isEmpty) {
            const decoration = {
              range: change.original,
              renderOptions: {},
            };
            insertionMarks.push(decoration);
          } else {
            const decoration = {
              range: change.original,
              renderOptions: {},
            };
            replacements.push(decoration);
          }
        }
      }
    } else {
      for (const lineChange of diff.changes) {
        for (const change of lineChange.innerChanges) {
          const originalText = editor.document.getText(change.original);
          const targetText = target.getText(change.modified);
          if (
            change.original.end.isEqual(cursorPosition) &&
            targetText.startsWith(originalText)
          ) {
            const decoration = {
              range: new vscode.Range(cursorPosition, cursorPosition),
              renderOptions: {
                after: {
                  ...this.cursorInsertionDecorationOptions.after,
                  contentText: targetText.slice(originalText.length),
                },
              },
            };
            cursorInsertions.push(decoration);
          } else if (change.original.isEmpty) {
            const decoration = {
              range: change.original,
              renderOptions: {
                after: {
                  ...this.insertionDecorationOptions.after,
                  contentText: targetText,
                },
              },
            };
            insertions.push(decoration);
          } else {
            const decoration = {
              range: change.original,
              renderOptions:
                targetText.length > 0
                  ? {
                      after: {
                        ...this.replacementDecorationOptions.after,
                        contentText: targetText,
                      },
                    }
                  : {},
            };
            replacements.push(decoration);
          }
        }
      }
    }

    if (editor.document.version !== context.documentContext.document.version) {
      logger.debug("Document changed, skip updating decoration.");
      return;
    }

    editor.setDecorations(this.replacementDecorationType, replacements);
    editor.setDecorations(this.insertionDecorationType, insertions);
    editor.setDecorations(this.cursorInsertionDecorationType, cursorInsertions);
    editor.setDecorations(this.imageDecorationType, images);
    editor.setDecorations(this.insertionMarkDecorationType, insertionMarks);

    this.current = { editor, solution };
    vscode.commands.executeCommand(
      "setContext",
      "pochiNextEditSuggestionVisible",
      true,
    );
    logger.debug("Decoration updated.");
  }

  async accept() {
    logger.debug("Accepting the current edit suggestion");
    if (!this.current) {
      logger.debug("No current edit suggestion to accept");
      return;
    }
    const { editor, solution } = this.current;
    await editor.edit((editBuilder) => {
      for (const change of solution.textEdit.changes) {
        editBuilder.replace(
          toPositionRange(change.range, editor.document),
          change.text,
        );
      }
    });
    this.hide();

    // Move cursor to the end of the edited range
    const reducedEditedRange = solution.diff.changes.reduce<
      vscode.Range | undefined
    >((acc, curr) => {
      const editedRange = curr.innerChanges.reduce<vscode.Range | undefined>(
        (a, c) => {
          return a ? a.union(c.modified) : c.modified;
        },
        undefined,
      );
      return acc ? (editedRange ? acc.union(editedRange) : acc) : editedRange;
    }, undefined);
    if (reducedEditedRange) {
      editor.selection = new vscode.Selection(
        reducedEditedRange.end,
        reducedEditedRange.end,
      );
    }
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
    editor.setDecorations(this.cursorInsertionDecorationType, []);
    editor.setDecorations(this.imageDecorationType, []);
    editor.setDecorations(this.insertionMarkDecorationType, []);
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
