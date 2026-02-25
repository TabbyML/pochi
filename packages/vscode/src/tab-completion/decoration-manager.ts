import { getLogger } from "@/lib/logger";
import { inject, injectable, singleton } from "tsyringe";
import * as vscode from "vscode";
// biome-ignore lint/style/useImportType: needed for dependency injection
import { CanvasRenderer, TextmateThemer } from "./code-image-renderer";
import type { Decoration } from "./code-image-renderer/types";
import type { TabCompletionSolutionItem } from "./solution/item";
import {
  type CodeDiff,
  type LineRangeMapping,
  type TextDocumentSnapshot,
  asLinesInsertion,
  asLinesRemoval,
  isBlank,
  lineNumberRangeToPositionRange,
} from "./utils";

const logger = getLogger("TabCompletion.DecorationManager");

@injectable()
@singleton()
export class TabCompletionDecorationManager implements vscode.Disposable {
  // Scroll indicator decoration
  // shown when scrolling to edit range is required
  private scrollIndicatorUpDecorationType: vscode.TextEditorDecorationType;
  private scrollIndicatorDownDecorationType: vscode.TextEditorDecorationType;
  private scrollIndicatorDecorationOptions: vscode.DecorationInstanceRenderOptions;

  // Image decoration
  // preview code after edit
  private imageDecorationType: vscode.TextEditorDecorationType;
  private imageDecorationOptions: vscode.DecorationInstanceRenderOptions;

  // Edit range decoration
  // mark the edit range
  private editRangeSingleLineDecorationType: vscode.TextEditorDecorationType;
  private editRangeFirstLineDecorationType: vscode.TextEditorDecorationType;
  private editRangeLastLineDecorationType: vscode.TextEditorDecorationType;
  private editRangeMidLinesDecorationType: vscode.TextEditorDecorationType;

  // Word removal/replacement decoration
  // mark removed text with red background
  // can add new text with green background after the removed text with wordInsertionDecorationOptions
  private spaceRemovalDecorationType: vscode.TextEditorDecorationType;
  private wordRemovalDecorationType: vscode.TextEditorDecorationType;

  // Word insertion decoration
  // add new text with green background at the position
  private wordInsertionDecorationType: vscode.TextEditorDecorationType;
  private wordInsertionDecorationOptions: vscode.DecorationInstanceRenderOptions;

  // Line removal decoration
  // mark removed line with red background
  private lineRemovalSingleLineDecorationType: vscode.TextEditorDecorationType;
  private lineRemovalFirstLineDecorationType: vscode.TextEditorDecorationType;
  private lineRemovalLastLineDecorationType: vscode.TextEditorDecorationType;
  private lineRemovalMidLinesDecorationType: vscode.TextEditorDecorationType;

  // Word insertion marker decoration
  // mark a position where word insertion is previewed in image decoration
  private wordInsertionMarkerDecorationType: vscode.TextEditorDecorationType;

  // Line insertion marker decoration
  // mark a position where lines insertion is previewed in image decoration
  private lineInsertionMarkerDecorationType: vscode.TextEditorDecorationType;

  private allDecorationTypes: vscode.TextEditorDecorationType[];

  constructor(
    @inject("vscode.ExtensionContext")
    private readonly extensionContext: vscode.ExtensionContext,
    private readonly textmateThemer: TextmateThemer,
    private readonly canvasRenderer: CanvasRenderer,
  ) {
    // Scroll indicator decoration
    this.scrollIndicatorUpDecorationType =
      vscode.window.createTextEditorDecorationType({
        light: {
          gutterIconPath: vscode.Uri.file(
            this.extensionContext.asAbsolutePath("assets/icons/arrow-up.svg"),
          ),
          gutterIconSize: "90%",
        },
        dark: {
          gutterIconPath: vscode.Uri.file(
            this.extensionContext.asAbsolutePath(
              "assets/icons/arrow-up-dark.svg",
            ),
          ),
          gutterIconSize: "90%",
        },
      });
    this.scrollIndicatorDownDecorationType =
      vscode.window.createTextEditorDecorationType({
        light: {
          gutterIconPath: vscode.Uri.file(
            this.extensionContext.asAbsolutePath("assets/icons/arrow-down.svg"),
          ),
          gutterIconSize: "90%",
        },
        dark: {
          gutterIconPath: vscode.Uri.file(
            this.extensionContext.asAbsolutePath(
              "assets/icons/arrow-down-dark.svg",
            ),
          ),
          gutterIconSize: "90%",
        },
      });
    this.scrollIndicatorDecorationOptions = {
      before: {
        contentText: "⇥ Tab to scroll",
        color: new vscode.ThemeColor(
          "pochi.tabCompletion.scrollIndicator.foreground",
        ),
        backgroundColor: new vscode.ThemeColor(
          "pochi.tabCompletion.scrollIndicator.background",
        ),
        margin:
          "-4px 0 0 55.5ch; padding: 4px; position: absolute; z-index: 10000;",
        border:
          "0; border-radius: 4px; box-shadow: 0 0 4px 4px rgba(0,108,198,0.2);",
      },
    };

    // Image decoration
    this.imageDecorationType = vscode.window.createTextEditorDecorationType({});
    this.imageDecorationOptions = {
      before: {
        backgroundColor: new vscode.ThemeColor(
          "editorSuggestWidget.background",
        ),
        border: "8px solid",
        borderColor: new vscode.ThemeColor(
          "pochi.tabCompletion.diffWidget.border",
        ),
      },
    };

    // Edit range decoration
    this.editRangeSingleLineDecorationType =
      vscode.window.createTextEditorDecorationType({
        isWholeLine: true,
        border: "2px solid",
        borderWidth: "2px 0 2px 0",
        borderColor: new vscode.ThemeColor(
          "pochi.tabCompletion.editRange.border",
        ),
        backgroundColor: new vscode.ThemeColor(
          "pochi.tabCompletion.editRange.background",
        ),
        light: {
          gutterIconPath: vscode.Uri.file(
            this.extensionContext.asAbsolutePath(
              "assets/icons/arrow-right.svg",
            ),
          ),
          gutterIconSize: "90%",
        },
        dark: {
          gutterIconPath: vscode.Uri.file(
            this.extensionContext.asAbsolutePath(
              "assets/icons/arrow-right-dark.svg",
            ),
          ),
          gutterIconSize: "90%",
        },
      });
    this.editRangeFirstLineDecorationType =
      vscode.window.createTextEditorDecorationType({
        isWholeLine: true,
        border: "2px solid",
        borderWidth: "2px 0 0 0",
        borderColor: new vscode.ThemeColor(
          "pochi.tabCompletion.editRange.border",
        ),
        backgroundColor: new vscode.ThemeColor(
          "pochi.tabCompletion.editRange.background",
        ),
        light: {
          gutterIconPath: vscode.Uri.file(
            this.extensionContext.asAbsolutePath(
              "assets/icons/arrow-right.svg",
            ),
          ),
          gutterIconSize: "90%",
        },
        dark: {
          gutterIconPath: vscode.Uri.file(
            this.extensionContext.asAbsolutePath(
              "assets/icons/arrow-right-dark.svg",
            ),
          ),
          gutterIconSize: "90%",
        },
      });
    this.editRangeLastLineDecorationType =
      vscode.window.createTextEditorDecorationType({
        isWholeLine: true,
        border: "2px solid",
        borderWidth: "0 0 2px 0",
        borderColor: new vscode.ThemeColor(
          "pochi.tabCompletion.editRange.border",
        ),
        backgroundColor: new vscode.ThemeColor(
          "pochi.tabCompletion.editRange.background",
        ),
      });
    this.editRangeMidLinesDecorationType =
      vscode.window.createTextEditorDecorationType({
        isWholeLine: true,
        backgroundColor: new vscode.ThemeColor(
          "pochi.tabCompletion.editRange.background",
        ),
      });

    // Word replacement/removal decoration
    this.spaceRemovalDecorationType =
      vscode.window.createTextEditorDecorationType({
        backgroundColor: new vscode.ThemeColor(
          "inlineEdit.originalChangedTextBackground",
        ),
        border: "2px solid; border-radius: 2px;",
        borderColor: new vscode.ThemeColor(
          "inlineEdit.tabWillAcceptOriginalBorder",
        ),
      });
    this.wordRemovalDecorationType =
      vscode.window.createTextEditorDecorationType({
        backgroundColor: new vscode.ThemeColor(
          "inlineEdit.originalChangedTextBackground",
        ),
        border: "2px solid; border-radius: 2px;",
        borderColor: new vscode.ThemeColor(
          "inlineEdit.tabWillAcceptOriginalBorder",
        ),
        textDecoration: "line-through",
      });

    // Word insertion decoration
    this.wordInsertionDecorationType =
      vscode.window.createTextEditorDecorationType({});
    this.wordInsertionDecorationOptions = {
      after: {
        backgroundColor: new vscode.ThemeColor(
          "inlineEdit.modifiedChangedTextBackground",
        ),
        border: "2px solid; border-radius: 2px;",
        margin: "0 0 0 2px",
        borderColor: new vscode.ThemeColor(
          "inlineEdit.tabWillAcceptModifiedBorder",
        ),
      },
    };

    // Line removal decoration
    this.lineRemovalSingleLineDecorationType =
      vscode.window.createTextEditorDecorationType({
        isWholeLine: true,
        border: "2px solid",
        borderWidth: "2px 0 2px 0",
        borderColor: new vscode.ThemeColor(
          "inlineEdit.tabWillAcceptOriginalBorder",
        ),
        backgroundColor: new vscode.ThemeColor(
          "inlineEdit.originalChangedTextBackground",
        ),
      });
    this.lineRemovalFirstLineDecorationType =
      vscode.window.createTextEditorDecorationType({
        isWholeLine: true,
        border: "2px solid",
        borderWidth: "2px 0 0 0",
        borderColor: new vscode.ThemeColor(
          "inlineEdit.tabWillAcceptOriginalBorder",
        ),
        backgroundColor: new vscode.ThemeColor(
          "inlineEdit.originalChangedTextBackground",
        ),
      });
    this.lineRemovalLastLineDecorationType =
      vscode.window.createTextEditorDecorationType({
        isWholeLine: true,
        border: "2px solid",
        borderWidth: "0 0 2px 0",
        borderColor: new vscode.ThemeColor(
          "inlineEdit.tabWillAcceptOriginalBorder",
        ),
        backgroundColor: new vscode.ThemeColor(
          "inlineEdit.originalChangedTextBackground",
        ),
      });
    this.lineRemovalMidLinesDecorationType =
      vscode.window.createTextEditorDecorationType({
        isWholeLine: true,
        backgroundColor: new vscode.ThemeColor(
          "inlineEdit.originalChangedTextBackground",
        ),
      });

    // Word insertion marker decoration
    this.wordInsertionMarkerDecorationType =
      vscode.window.createTextEditorDecorationType({
        border: "2px solid",
        borderColor: new vscode.ThemeColor(
          "inlineEdit.tabWillAcceptModifiedBorder",
        ),
      });

    // Line insertion marker decoration
    this.lineInsertionMarkerDecorationType =
      vscode.window.createTextEditorDecorationType({
        isWholeLine: true,
        border: "2px solid",
        borderWidth: "2px 0 0 0",
        borderColor: new vscode.ThemeColor(
          "inlineEdit.tabWillAcceptModifiedBorder",
        ),
      });

    this.allDecorationTypes = [
      this.scrollIndicatorUpDecorationType,
      this.scrollIndicatorDownDecorationType,
      this.imageDecorationType,
      this.editRangeSingleLineDecorationType,
      this.editRangeFirstLineDecorationType,
      this.editRangeLastLineDecorationType,
      this.editRangeMidLinesDecorationType,
      this.spaceRemovalDecorationType,
      this.wordRemovalDecorationType,
      this.wordInsertionDecorationType,
      this.lineRemovalSingleLineDecorationType,
      this.lineRemovalFirstLineDecorationType,
      this.lineRemovalLastLineDecorationType,
      this.lineRemovalMidLinesDecorationType,
      this.wordInsertionMarkerDecorationType,
      this.lineInsertionMarkerDecorationType,
    ];
  }

  async initialize() {
    await Promise.all([
      this.textmateThemer.initialize(),
      this.canvasRenderer.initialize(),
    ]);
  }

  async show(
    editor: vscode.TextEditor,
    item: TabCompletionSolutionItem,
    token: vscode.CancellationToken, // cancel to hide
  ) {
    if (token.isCancellationRequested) {
      return;
    }

    const disposables: vscode.Disposable[] = [];
    const cleanup = () => {
      updatePochiTabCompletionState(undefined);
      this.clearDecoration(editor);
      for (const disposable of disposables) {
        disposable.dispose();
      }
    };

    disposables.push(
      token.onCancellationRequested(() => {
        cleanup();
      }),
    );

    const {
      context,
      diff,
      editRange: baseEditRange,
      target: modifiedDocument,
    } = item;
    const originalDocument = context.documentSnapshot;

    // expand editRange
    const showContextLines = 2;
    const editRange = {
      original: {
        start: Math.max(0, baseEditRange.original.start - showContextLines),
        end: Math.min(
          originalDocument.lineCount,
          baseEditRange.original.end + showContextLines,
        ),
      },
      modified: {
        start: Math.max(0, baseEditRange.modified.start - showContextLines),
        end: Math.min(
          modifiedDocument.lineCount,
          baseEditRange.modified.end + showContextLines,
        ),
      },
    };

    logger.debug("Will show decoration: ", {
      diff,
      original: originalDocument.getText(),
      modified: modifiedDocument.getText(),
    });

    let previewImage:
      | Awaited<ReturnType<typeof this.createPreviewImage>>
      | undefined = undefined;
    if (shouldUseImageDecoration(diff, modifiedDocument)) {
      previewImage = await this.createPreviewImage(
        originalDocument,
        modifiedDocument,
        diff,
        editRange,
        getEditorRenderOptions(editor),
        token,
      );
      if (!previewImage) {
        cleanup();
        return;
      }
    }

    const updateDecoration = () => {
      updatePochiTabCompletionState(undefined);
      this.clearDecoration(editor);

      const visibleRanges = editor.visibleRanges.toSorted(
        (r1, r2) => r1.start.line - r2.start.line,
      );
      if (visibleRanges.length === 0) {
        logger.trace("Cannot get visible ranges.");
        return;
      }
      logger.trace("VisibleRanges:", visibleRanges);

      const editPositionRange = lineNumberRangeToPositionRange(
        editRange.original,
        originalDocument,
      );
      logger.trace("EditPositionRange:", editPositionRange);

      // Edit range is collapsed
      const collapsedRanges: vscode.Range[] = [];
      for (let i = 0; i < visibleRanges.length - 1; i++) {
        const endOfCurrent = visibleRanges[i].end;
        const startOfNext = visibleRanges[i + 1].start;
        if (endOfCurrent.line < startOfNext.line) {
          collapsedRanges.push(new vscode.Range(endOfCurrent, startOfNext));
        }
      }
      if (collapsedRanges.some((r) => r.intersection(editPositionRange))) {
        logger.trace("Edit range is collapsed.");
        return;
      }

      // Edit range is before visible start line
      if (editRange.original.start < visibleRanges[0].start.line) {
        const visibleLineNearStart = getNthVisibleLine(visibleRanges, 5);
        if (visibleLineNearStart === undefined) {
          logger.trace("Cannot get visibleLineNearStart.");
          return;
        }

        const scrollIndicatorPosition = new vscode.Position(
          visibleLineNearStart,
          0,
        );

        const decoration: vscode.DecorationOptions = {
          range: new vscode.Range(
            scrollIndicatorPosition,
            scrollIndicatorPosition,
          ),
          renderOptions: this.scrollIndicatorDecorationOptions,
        };
        editor.setDecorations(this.scrollIndicatorUpDecorationType, [
          decoration,
        ]);
        updatePochiTabCompletionState("scrollIndicatorVisible");
        logger.debug("Decoration updated: scroll indicator up visible.");
        return;
      }

      // Edit range is after visible end line
      if (
        editRange.original.end - 1 >
        visibleRanges[visibleRanges.length - 1].end.line
      ) {
        const visibleLineNearEnd = getNthVisibleLine(visibleRanges, -5);
        if (visibleLineNearEnd === undefined) {
          logger.trace("Cannot get visibleLineNearEnd.");
          return;
        }

        const scrollIndicatorPosition = new vscode.Position(
          visibleLineNearEnd,
          0,
        );
        const decoration: vscode.DecorationOptions = {
          range: new vscode.Range(
            scrollIndicatorPosition,
            scrollIndicatorPosition,
          ),
          renderOptions: this.scrollIndicatorDecorationOptions,
        };
        editor.setDecorations(this.scrollIndicatorDownDecorationType, [
          decoration,
        ]);
        updatePochiTabCompletionState("scrollIndicatorVisible");
        logger.debug("Decoration updated: scroll indicator down visible.");
        return;
      }

      // Edit range decoration
      if (editRange.original.end - editRange.original.start <= 1) {
        editor.setDecorations(this.editRangeSingleLineDecorationType, [
          {
            range: new vscode.Range(
              editRange.original.start,
              0,
              editRange.original.start,
              0,
            ),
          },
        ]);
      } else {
        editor.setDecorations(this.editRangeFirstLineDecorationType, [
          {
            range: new vscode.Range(
              editRange.original.start,
              0,
              editRange.original.start,
              0,
            ),
          },
        ]);
        editor.setDecorations(this.editRangeLastLineDecorationType, [
          {
            range: new vscode.Range(
              editRange.original.end - 1,
              0,
              editRange.original.end - 1,
              0,
            ),
          },
        ]);
        if (editRange.original.end - editRange.original.start > 2) {
          editor.setDecorations(this.editRangeMidLinesDecorationType, [
            {
              range: new vscode.Range(
                editRange.original.start + 1,
                0,
                editRange.original.end - 2,
                0,
              ),
            },
          ]);
        }
      }

      // Show image decoration
      if (previewImage) {
        let imageDecorationDirection: "right" | "below" | "above";
        if (previewImage.showAtColumn > 0) {
          imageDecorationDirection = "right";
        } else {
          const imagePreviewLines =
            editRange.modified.end - editRange.modified.start;
          const previewAboveAvailableLine = getNthVisibleLine(
            visibleRanges,
            imagePreviewLines,
          );
          const previewBelowAvailableLine = getNthVisibleLine(
            visibleRanges,
            -imagePreviewLines,
          );

          if (
            previewBelowAvailableLine &&
            editRange.original.end - 1 < previewBelowAvailableLine
          ) {
            imageDecorationDirection = "below";
          } else if (
            previewAboveAvailableLine &&
            editRange.original.start > previewAboveAvailableLine
          ) {
            imageDecorationDirection = "above";
          } else {
            // fallback as below
            imageDecorationDirection = "below";
          }
        }

        const imageDecorationPosition =
          imageDecorationDirection === "below"
            ? new vscode.Position(editRange.original.end, 0)
            : new vscode.Position(editRange.original.start, 0);
        const margin = buildMarginCss({
          marginTop:
            imageDecorationDirection === "above"
              ? `${-previewImage.height / previewImage.scale - 4}px`
              : "-4px",
          marginLeft:
            imageDecorationDirection === "right"
              ? `${previewImage.showAtColumn}ch`
              : "-4px",
          scale: 1 / previewImage.scale,
        });

        // Create the image decoration
        const imageDecoration: vscode.DecorationOptions = {
          range: new vscode.Range(
            imageDecorationPosition,
            imageDecorationPosition,
          ),
          renderOptions: {
            before: {
              ...this.imageDecorationOptions.before,
              margin: margin,
              contentIconPath: vscode.Uri.parse(previewImage.dataUrl),
            },
          },
        };
        editor.setDecorations(this.imageDecorationType, [imageDecoration]);

        // Create word/line removal decorations and word/line insertion markers
        const spaceRemovals: vscode.DecorationOptions[] = [];
        const wordRemovals: vscode.DecorationOptions[] = [];
        const lineRemovalsSingleLine: vscode.DecorationOptions[] = [];
        const lineRemovalsFirstLine: vscode.DecorationOptions[] = [];
        const lineRemovalsLastLine: vscode.DecorationOptions[] = [];
        const lineRemovalsMidLines: vscode.DecorationOptions[] = [];
        const wordInsertionMarkers: vscode.DecorationOptions[] = [];
        const lineInsertionMarkers: vscode.DecorationOptions[] = [];

        for (const lineChange of diff.changes) {
          for (const change of lineChange.innerChanges) {
            const linesRemoval = asLinesRemoval(
              change,
              originalDocument,
              modifiedDocument,
            );
            const linesInsertion = asLinesInsertion(
              change,
              originalDocument,
              modifiedDocument,
            );
            if (linesRemoval) {
              if (
                linesRemoval.original.end - linesRemoval.original.start ===
                1
              ) {
                lineRemovalsSingleLine.push({
                  range: new vscode.Range(
                    linesRemoval.original.start,
                    0,
                    linesRemoval.original.start,
                    0,
                  ),
                });
              } else {
                lineRemovalsFirstLine.push({
                  range: new vscode.Range(
                    linesRemoval.original.start,
                    0,
                    linesRemoval.original.start,
                    0,
                  ),
                });
                lineRemovalsLastLine.push({
                  range: new vscode.Range(
                    linesRemoval.original.end - 1,
                    0,
                    linesRemoval.original.end - 1,
                    0,
                  ),
                });
                if (
                  linesRemoval.original.end - linesRemoval.original.start >
                  2
                ) {
                  lineRemovalsMidLines.push({
                    range: new vscode.Range(
                      linesRemoval.original.start + 1,
                      0,
                      linesRemoval.original.end - 2,
                      0,
                    ),
                  });
                }
              }
            } else if (linesInsertion) {
              if (linesInsertion.original.start < originalDocument.lineCount) {
                lineInsertionMarkers.push({
                  range: new vscode.Range(
                    linesInsertion.original.start,
                    0,
                    linesInsertion.original.start,
                    0,
                  ),
                });
              }
            } else if (change.original.isEmpty) {
              wordInsertionMarkers.push({ range: change.original });
            } else if (isBlank(originalDocument.getText(change.original))) {
              spaceRemovals.push({
                range: change.original,
              });
            } else {
              wordRemovals.push({
                range: change.original,
              });
            }
          }
        }

        editor.setDecorations(this.spaceRemovalDecorationType, spaceRemovals);
        editor.setDecorations(this.wordRemovalDecorationType, wordRemovals);
        editor.setDecorations(
          this.lineRemovalSingleLineDecorationType,
          lineRemovalsSingleLine,
        );
        editor.setDecorations(
          this.lineRemovalFirstLineDecorationType,
          lineRemovalsFirstLine,
        );
        editor.setDecorations(
          this.lineRemovalLastLineDecorationType,
          lineRemovalsLastLine,
        );
        editor.setDecorations(
          this.lineRemovalMidLinesDecorationType,
          lineRemovalsMidLines,
        );
        editor.setDecorations(
          this.wordInsertionMarkerDecorationType,
          wordInsertionMarkers,
        );
        editor.setDecorations(
          this.lineInsertionMarkerDecorationType,
          lineInsertionMarkers,
        );
        updatePochiTabCompletionState("diffVisible");
        logger.debug("Decoration updated: image decoration visible.");
        return;
      }

      // Inline diff preview

      // Create word replacement/removal/insertion decorations and line removal decorations
      const spaceRemovals: vscode.DecorationOptions[] = [];
      const wordRemovals: vscode.DecorationOptions[] = [];
      const wordInsertions: vscode.DecorationOptions[] = [];
      const lineRemovalsSingleLine: vscode.DecorationOptions[] = [];
      const lineRemovalsFirstLine: vscode.DecorationOptions[] = [];
      const lineRemovalsLastLine: vscode.DecorationOptions[] = [];
      const lineRemovalsMidLines: vscode.DecorationOptions[] = [];

      for (const lineChange of diff.changes) {
        for (const change of lineChange.innerChanges) {
          const targetText = modifiedDocument.getText(change.modified);
          const linesRemoval = asLinesRemoval(
            change,
            originalDocument,
            modifiedDocument,
          );
          if (linesRemoval) {
            if (linesRemoval.original.end - linesRemoval.original.start === 1) {
              lineRemovalsSingleLine.push({
                range: new vscode.Range(
                  linesRemoval.original.start,
                  0,
                  linesRemoval.original.start,
                  0,
                ),
              });
            } else {
              lineRemovalsFirstLine.push({
                range: new vscode.Range(
                  linesRemoval.original.start,
                  0,
                  linesRemoval.original.start,
                  0,
                ),
              });
              lineRemovalsLastLine.push({
                range: new vscode.Range(
                  linesRemoval.original.end - 1,
                  0,
                  linesRemoval.original.end - 1,
                  0,
                ),
              });
              if (linesRemoval.original.end - linesRemoval.original.start > 2) {
                lineRemovalsMidLines.push({
                  range: new vscode.Range(
                    linesRemoval.original.start + 1,
                    0,
                    linesRemoval.original.end - 2,
                    0,
                  ),
                });
              }
            }
          } else if (change.original.isEmpty) {
            wordInsertions.push({
              range: change.original,
              renderOptions: {
                after: {
                  ...this.wordInsertionDecorationOptions.after,
                  contentText: targetText,
                },
              },
            });
          } else if (isBlank(originalDocument.getText(change.original))) {
            spaceRemovals.push({
              range: change.original,
              renderOptions:
                targetText.length > 0
                  ? {
                      after: {
                        ...this.wordInsertionDecorationOptions.after,
                        contentText: targetText,
                      },
                    }
                  : undefined,
            });
          } else {
            wordRemovals.push({
              range: change.original,
              renderOptions:
                targetText.length > 0
                  ? {
                      after: {
                        ...this.wordInsertionDecorationOptions.after,
                        contentText: targetText,
                      },
                    }
                  : undefined,
            });
          }
        }
      }

      editor.setDecorations(this.spaceRemovalDecorationType, spaceRemovals);
      editor.setDecorations(this.wordRemovalDecorationType, wordRemovals);
      editor.setDecorations(this.wordInsertionDecorationType, wordInsertions);
      editor.setDecorations(
        this.lineRemovalSingleLineDecorationType,
        lineRemovalsSingleLine,
      );
      editor.setDecorations(
        this.lineRemovalFirstLineDecorationType,
        lineRemovalsFirstLine,
      );
      editor.setDecorations(
        this.lineRemovalLastLineDecorationType,
        lineRemovalsLastLine,
      );
      editor.setDecorations(
        this.lineRemovalMidLinesDecorationType,
        lineRemovalsMidLines,
      );
      updatePochiTabCompletionState("diffVisible");
      logger.debug("Decoration updated: inline diff decoration visible.");
    };

    updateDecoration();
    disposables.push(
      vscode.window.onDidChangeTextEditorVisibleRanges((event) => {
        if (event.textEditor === editor) {
          updateDecoration();
        }
      }),
    );
  }

  private async createPreviewImage(
    originalDocument: TextDocumentSnapshot,
    modifiedDocument: TextDocumentSnapshot,
    diff: CodeDiff,
    editRange: LineRangeMapping,
    editorRenderOptions: EditorRenderOptions,
    token: vscode.CancellationToken,
  ) {
    // Check the longest line to determine the position of the image decoration.
    const longestLineCharsThreshold = 80;
    let longestLineChars = 0;
    for (
      let lineNumber = editRange.original.start;
      lineNumber < editRange.original.end;
      lineNumber++
    ) {
      const line = originalDocument.lineAt(lineNumber);
      longestLineChars = Math.max(longestLineChars, line.text.length);
    }
    const showAtRight = longestLineChars <= longestLineCharsThreshold;

    const themedDocument = await this.textmateThemer.theme(
      modifiedDocument,
      editRange.modified,
      token,
    );
    if (token.isCancellationRequested) {
      return undefined;
    }

    const decorations: Decoration[] = diff.changes.flatMap((lineChange) => {
      const results: Decoration[] = [];
      for (const change of lineChange.innerChanges) {
        const linesRemoval = asLinesRemoval(
          change,
          originalDocument,
          modifiedDocument,
        );
        if (linesRemoval) {
          continue;
        }

        const linesInsertion = asLinesInsertion(
          change,
          originalDocument,
          modifiedDocument,
        );
        if (linesInsertion) {
          results.push({
            type: "line" as const,
            start: linesInsertion.modified.start - editRange.modified.start,
            end: linesInsertion.modified.end - editRange.modified.start,
          });
          continue;
        }

        const range = change.modified;
        let line = range.start.line;
        while (line <= range.end.line) {
          let start = line === range.start.line ? range.start.character : 0;
          if (start === 0) {
            start =
              modifiedDocument.lineAt(line).firstNonWhitespaceCharacterIndex;
          }
          const end =
            line === range.end.line
              ? range.end.character
              : modifiedDocument.lineAt(line).range.end.character;
          results.push({
            type: "chars",
            line: line - editRange.modified.start,
            start,
            end,
          });
          line++;
        }
      }
      return results;
    });

    // Render image preview
    const imageScale = 4;
    const imageRenderingInput = {
      scale: imageScale,

      padding: 2,
      fontSize: editorRenderOptions.fontSize,
      lineHeight: editorRenderOptions.lineHeight,
      tabSize: editorRenderOptions.tabSize,

      colorMap: themedDocument.colorMap,
      foreground: themedDocument.foreground,
      background: 0, // use transparent
      tokenLines: themedDocument.tokenLines,

      decorations: decorations.map((item) => {
        return {
          ...item,
          borderColor: "#7aa32333",
          background: "#9ccc2c33",
        };
      }),

      hideSharedIndentation: showAtRight,
    };

    logger.debug("Creating image for decoration.");
    logger.trace("Image rendering input:", imageRenderingInput);

    const imageRenderingOutput =
      await this.canvasRenderer.render(imageRenderingInput);
    if (token.isCancellationRequested) {
      return undefined;
    }

    if (!imageRenderingOutput) {
      logger.debug("Failed to create image for decoration.");
      return undefined;
    }

    logger.debug("Created image for decoration.");
    const { image, width, height } = imageRenderingOutput;
    const base64Image = Buffer.from(image).toString("base64");
    const dataUrl = `data:image/png;base64,${base64Image}`;
    return {
      dataUrl,
      width,
      height,
      scale: imageScale,
      showAtColumn: showAtRight ? longestLineChars + 4 : 0,
    };
  }

  private clearDecoration(editor: vscode.TextEditor) {
    for (const type of this.allDecorationTypes) {
      editor.setDecorations(type, []);
    }
  }

  dispose() {
    for (const type of this.allDecorationTypes) {
      type.dispose();
    }
  }
}

function updatePochiTabCompletionState(
  value: "diffVisible" | "scrollIndicatorVisible" | undefined,
) {
  vscode.commands.executeCommand(
    "setContext",
    "pochiTabCompletionState",
    value,
  );
}

type EditorRenderOptions = {
  fontSize: number;
  lineHeight: number;
  tabSize: number;
};

function getEditorRenderOptions(
  editor: vscode.TextEditor,
): EditorRenderOptions {
  const config = vscode.workspace.getConfiguration("editor");
  const fontSize = config.get<number>("fontSize", 14);
  const lineHeight = config.get<number>("lineHeight", 0);
  const tabSize = (editor.options.tabSize as number | undefined) || 4;
  return { fontSize, lineHeight, tabSize };
}

function buildMarginCss(params: {
  marginTop: string;
  marginLeft: string;
  scale: number;
}) {
  return `${params.marginTop} 0 0 ${params.marginLeft}; position: absolute; z-index: 10000; transform-origin: 0 0; transform: scale(${params.scale});`;
}

function shouldUseImageDecoration(
  diff: CodeDiff,
  target: vscode.TextDocument,
): boolean {
  return diff.changes.some((change) => {
    if (
      change.modified.end - change.modified.start >
      change.original.end - change.original.start
    ) {
      // Add lines
      return true;
    }
    if (
      change.innerChanges.some(
        (c) => target.getText(c.modified).split("\n").length > 1,
      )
    ) {
      // Has multi-line insertion
      return true;
    }
    return false;
  });
}

function getNthVisibleLine(
  visibleRanges: readonly vscode.Range[],
  n: number,
): number | undefined {
  if (n >= 0) {
    let lineCount = 0;
    for (const range of visibleRanges) {
      const start = range.start.line;
      const end = range.end.line;
      const rangeLineCount = end - start + 1;
      if (lineCount + rangeLineCount > n) {
        return start + (n - lineCount);
      }
      lineCount += rangeLineCount;
    }
  } else {
    let lineCount = 0;
    for (let i = visibleRanges.length - 1; i >= 0; i--) {
      const range = visibleRanges[i];
      const start = range.start.line;
      const end = range.end.line;
      const rangeLineCount = end - start + 1;
      if (lineCount + rangeLineCount > -n - 1) {
        return end - (-n - 1 - lineCount);
      }
      lineCount += rangeLineCount;
    }
  }
  return undefined;
}
