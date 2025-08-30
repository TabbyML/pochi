import * as path from "node:path";
import { setTimeout as setTimeoutPromise } from "node:timers/promises";
import {
  diagnosticsToProblemsString,
  getNewDiagnostics,
} from "@/lib/diagnostic";
import {
  ensureFileDirectoryExists,
  getWorkspaceFolder,
  isFileExists,
} from "@/lib/fs";
import { createPrettyPatch } from "@/lib/fs";
import { getLogger } from "@/lib/logger";
import { resolvePath } from "@getpochi/common/tool-utils";
import * as diff from "diff";
import * as runExclusive from "run-exclusive";
import * as vscode from "vscode";
import { DecorationController } from "./decoration-controller";
import { DiffOriginContentProvider } from "./diff-origin-content-provider";

const logger = getLogger("diffView");
const ShouldAutoScroll = true;

export class DiffView implements vscode.Disposable {
  private isFinalized = false;
  private streamedLines: string[] = [];

  private preDiagnostics: [vscode.Uri, vscode.Diagnostic[]][] =
    vscode.languages.getDiagnostics();
  private fadedOverlayController: DecorationController;
  private activeLineController: DecorationController;
  private editorDocumentUpdatedAt: number | undefined;

  private disposables: vscode.Disposable[] = [];

  private constructor(
    private readonly id: string,
    public readonly fileUri: vscode.Uri,
    private readonly fileExists: boolean,
    private readonly originalContent: string,
    private readonly activeDiffEditor: vscode.TextEditor,
  ) {
    this.fadedOverlayController = new DecorationController(
      "fadedOverlay",
      this.activeDiffEditor,
    );
    this.activeLineController = new DecorationController(
      "activeLine",
      this.activeDiffEditor,
    );
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument(
        ({ document, contentChanges }) => {
          if (
            document.uri.toString() ===
              this.activeDiffEditor.document.uri.toString() &&
            contentChanges.length > 0
          ) {
            this.editorDocumentUpdatedAt = Date.now();
          }
        },
      ),
    );
  }

  async focus() {
    await runVSCodeDiff(
      this.id,
      this.originalContent,
      this.fileExists,
      this.fileUri,
    );
  }

  dispose() {
    if (!this.fileExists) {
      // Delete file if file is empty
      (async () => {
        const metadata = await vscode.workspace.fs.stat(this.fileUri);
        if (metadata.size === 0) {
          await vscode.workspace.fs.delete(this.fileUri);
        }
      })().catch((err) => {
        logger.debug("Error deleting file", err);
      });
    }
    for (const d of this.disposables) {
      d.dispose();
    }
  }

  private revertAndClose = async () => {
    logger.debug("revert and close diff view");
    const updatedDocument = this.activeDiffEditor.document;
    await discardChangesWithWorkspaceEdit(
      updatedDocument,
      this.originalContent,
    );
    closeAllNonDirtyDiffViews();
  };

  async update(content: string, isFinal: boolean, abortSignal?: AbortSignal) {
    if (this.isFinalized) {
      return;
    }

    if (isFinal) {
      logger.debug("Finalizing file", this.fileUri.fsPath);
      this.isFinalized = true;
    }

    if (abortSignal) {
      abortSignal.addEventListener("abort", this.revertAndClose);
      this.disposables.push({
        dispose: () => {
          abortSignal.removeEventListener("abort", this.revertAndClose);
        },
      });
    }

    let accumulatedContent = content;
    // --- Fix to prevent duplicate BOM ---
    // Strip potential BOM from incoming content. VS Code's `applyEdit` might implicitly handle the BOM
    // when replacing from the start (0,0), and we want to avoid duplication.
    // Final BOM is handled in `saveChanges`.
    if (accumulatedContent.startsWith("\ufeff")) {
      accumulatedContent = content.slice(1); // Remove the BOM character
    }

    const diffEditor = this.activeDiffEditor;
    const document = diffEditor.document;

    const accumulatedLines = accumulatedContent.split("\n");
    if (!isFinal) {
      accumulatedLines.pop(); // remove the last partial line only if it's not the final update
    }
    const diffLines = accumulatedLines.slice(this.streamedLines.length);

    // Instead of animating each line, we'll update in larger chunks
    const currentLine = this.streamedLines.length + diffLines.length - 1;
    if (currentLine >= 0) {
      // Only proceed if we have new lines

      // Replace all content up to the current line with accumulated lines
      // This is necessary (as compared to inserting one line at a time) to handle cases where html tags on previous lines are auto closed for example
      const edit = new vscode.WorkspaceEdit();
      const rangeToReplace = new vscode.Range(0, 0, currentLine + 1, 0);
      const contentToReplace = `${accumulatedLines.slice(0, currentLine + 1).join("\n")}\n`;
      edit.replace(document.uri, rangeToReplace, contentToReplace);
      await vscode.workspace.applyEdit(edit);

      // Update decorations for the entire changed section
      this.activeLineController.setActiveLine(currentLine);
      this.fadedOverlayController.updateOverlayAfterLine(
        currentLine,
        document.lineCount,
      );

      if (ShouldAutoScroll) {
        if (diffLines.length <= 5) {
          // For small changes, just jump directly to the line
          this.scrollEditorToLine(currentLine);
        } else {
          // For larger changes, create a quick scrolling animation
          const startLine = this.streamedLines.length;
          const endLine = currentLine;
          const totalLines = endLine - startLine;
          const numSteps = 10; // Adjust this number to control animation speed
          const stepSize = Math.max(1, Math.floor(totalLines / numSteps));

          // Create and await the smooth scrolling animation
          for (let line = startLine; line <= endLine; line += stepSize) {
            diffEditor.revealRange(
              new vscode.Range(line, 0, line, 0),
              vscode.TextEditorRevealType.InCenter,
            );
            await new Promise((resolve) => setTimeout(resolve, 16)); // ~60fps
          }
          // Ensure we end at the final line
          this.scrollEditorToLine(currentLine);
        }
      }
    }

    // Update the streamedLines with the new accumulated content
    this.streamedLines = accumulatedLines;
    if (isFinal) {
      // Handle any remaining lines if the new content is shorter than the original
      if (this.streamedLines.length < document.lineCount) {
        const edit = new vscode.WorkspaceEdit();
        edit.delete(
          document.uri,
          new vscode.Range(this.streamedLines.length, 0, document.lineCount, 0),
        );
        await vscode.workspace.applyEdit(edit);
      }
      this.fadedOverlayController.clear();
      this.activeLineController.clear();

      await setTimeoutPromise(300);
      this.scrollToFirstDiff();
    }
  }

  private getEditSummary(original: string, modified: string) {
    const diffs = diff.diffLines(original, modified);
    let added = 0;
    let removed = 0;

    for (const part of diffs) {
      if (part.added) {
        added += part.count || 0;
      } else if (part.removed) {
        removed += part.count || 0;
      }
    }

    return { added, removed };
  }

  async saveChanges(relPath: string, newContent: string) {
    const updatedDocument = this.activeDiffEditor.document;
    const preSaveContent = updatedDocument.getText();
    if (updatedDocument.isDirty) {
      await updatedDocument.save();
    }
    const postSaveContent = updatedDocument.getText();
    const editSummary = this.getEditSummary(
      this.originalContent || "",
      postSaveContent,
    );

    const document = await vscode.workspace.openTextDocument(this.fileUri);
    await vscode.window.showTextDocument(document, {
      preview: false,
      preserveFocus: true,
    });

    needFocusDiffViews = true;
    await closeAllNonDirtyDiffViews();

    await this.waitForDiagnostic();
    const postDiagnostics = vscode.languages.getDiagnostics();
    const newProblems = diagnosticsToProblemsString(
      getNewDiagnostics(this.preDiagnostics, postDiagnostics),
      [
        vscode.DiagnosticSeverity.Error, // only including errors since warnings can be distracting (if user wants to fix warnings they can use the @problems mention)
      ],
      getWorkspaceFolder()?.uri.fsPath,
    ); // will be empty string if no errors

    const newContentEOL = newContent.includes("\r\n") ? "\r\n" : "\n";
    const normalizedPreSaveContent =
      preSaveContent.replace(/\r\n|\n/g, newContentEOL).trimEnd() +
      newContentEOL; // trimEnd to fix issue where editor adds in extra new line automatically
    const normalizedPostSaveContent =
      postSaveContent.replace(/\r\n|\n/g, newContentEOL).trimEnd() +
      newContentEOL; // this is the final content we return to the model to use as the new baseline for future edits
    const normalizedNewContent =
      newContent.replace(/\r\n|\n/g, newContentEOL).trimEnd() + newContentEOL;

    let userEdits: string | undefined;
    if (normalizedPreSaveContent !== normalizedNewContent) {
      // user made changes before approving edit. let the model know about user made changes (not including post-save auto-formatting changes)
      userEdits = createPrettyPatch(
        relPath,
        normalizedNewContent,
        normalizedPreSaveContent,
      );
    }

    let autoFormattingEdits: string | undefined;
    if (normalizedPreSaveContent !== normalizedPostSaveContent) {
      // auto-formatting was done by the editor
      autoFormattingEdits = createPrettyPatch(
        relPath,
        normalizedPreSaveContent,
        normalizedPostSaveContent,
      );
    }

    return {
      userEdits,
      autoFormattingEdits,
      newProblems,
      _meta: { editSummary },
    };
  }

  private scrollToFirstDiff() {
    const currentContent = this.activeDiffEditor.document.getText();
    const diffs = diff.diffLines(this.originalContent || "", currentContent);
    let lineCount = 0;
    for (const part of diffs) {
      if (part.added || part.removed) {
        // Found the first diff, scroll to it
        this.activeDiffEditor.revealRange(
          new vscode.Range(lineCount, 0, lineCount, 0),
          vscode.TextEditorRevealType.InCenter,
        );
        return;
      }
      if (!part.removed) {
        lineCount += part.count || 0;
      }
    }
  }

  private async waitForDiagnostic() {
    if (process.env.VSCODE_TEST_OPTIONS) {
      // No waiting in test mode
      return;
    }

    const waitForDiagnosticMs = 1000;
    const timeoutDuration =
      this.editorDocumentUpdatedAt !== undefined
        ? Math.max(
            1,
            Math.min(
              waitForDiagnosticMs,
              this.editorDocumentUpdatedAt + waitForDiagnosticMs - Date.now(),
            ),
          )
        : waitForDiagnosticMs;
    logger.debug(`Waiting ${timeoutDuration}ms for diagnostics to update...`);
    await new Promise((resolve) => {
      setTimeout(resolve, timeoutDuration);
    });
  }

  private scrollEditorToLine(line: number) {
    const lineCount = this.activeDiffEditor.document.lineCount;
    const scrollLine = Math.min(line + 4, lineCount - 1); // Scroll a few lines ahead for context
    this.activeDiffEditor.revealRange(
      new vscode.Range(scrollLine, 0, scrollLine, 0),
      vscode.TextEditorRevealType.InCenter,
    );
  }

  private static async createDiffView(
    id: string,
    relpath: string,
  ): Promise<DiffView> {
    const workspaceFolder = getWorkspaceFolder();
    const resolvedPath = resolvePath(relpath, workspaceFolder.uri.fsPath);
    const fileUri = vscode.Uri.file(resolvedPath);
    const fileExists = await isFileExists(fileUri);
    if (!fileExists) {
      await ensureFileDirectoryExists(fileUri);
      await vscode.workspace.fs.writeFile(fileUri, Buffer.from("", "utf-8"));
    }
    const originalContent = (
      await vscode.workspace.fs.readFile(fileUri)
    ).toString();
    const activeDiffEditor = await openDiffEditor(
      id,
      fileUri,
      fileExists,
      originalContent,
    );
    return new DiffView(
      id,
      fileUri,
      fileExists,
      originalContent,
      activeDiffEditor,
    );
  }

  private static readonly diffViewGetGroup = runExclusive.createGroupRef();
  static readonly getOrCreate = runExclusive.build(
    DiffView.diffViewGetGroup,
    async (id: string, relpath: string) => {
      // Install hook for first diff view
      if (DiffViewMap.size === 0 && !DiffViewDisposable) {
        logger.info("Installing diff view hook");
        DiffViewDisposable =
          vscode.window.tabGroups.onDidChangeTabs(handleTabChanges);
      }

      let diffView = DiffViewMap.get(id);
      if (!diffView) {
        diffView = await this.createDiffView(id, relpath);
        DiffViewMap.set(id, diffView);
        logger.debug(`Opened diff view for ${id}: ${relpath}`);
        logger.debug(`Total diff views: ${DiffViewMap.size}`);
      }

      return diffView;
    },
  );

  static readonly revertAndClose = async (id: string) => {
    const diffView = DiffViewMap.get(id);
    if (diffView) {
      diffView.revertAndClose();
    }
  };
}

const DiffViewMap = new Map<string, DiffView>();
let DiffViewDisposable: vscode.Disposable | undefined;

async function openDiffEditor(
  id: string,
  fileUri: vscode.Uri,
  fileExists: boolean,
  originalContent: string | undefined,
): Promise<vscode.TextEditor> {
  for (const group of vscode.window.tabGroups.all) {
    for (const tab of group.tabs) {
      if (
        tab.input instanceof vscode.TabInputTextDiff &&
        tab.input?.original?.scheme === DiffOriginContentProvider.scheme &&
        tab.input.modified.fsPath === fileUri.fsPath
      ) {
        for (const textEditor of vscode.window.visibleTextEditors) {
          if (textEditor.document.uri.fsPath === fileUri.fsPath) {
            return textEditor;
          }
        }
      }
    }
  }

  return runVSCodeDiff(id, originalContent, fileExists, fileUri);
}

function runVSCodeDiff(
  id: string,
  originalContent: string | undefined,
  fileExists: boolean,
  fileUri: vscode.Uri,
): Promise<vscode.TextEditor> {
  logger.debug("Opening new diff editor", fileUri.fsPath);
  return new Promise<vscode.TextEditor>((resolve, reject) => {
    const fileName = path.basename(fileUri.fsPath);
    const disposable = vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor && editor.document.uri.fsPath === fileUri.fsPath) {
        disposable.dispose();
        resolve(editor);
      }
    });
    vscode.commands.executeCommand(
      "vscode.diff",
      vscode.Uri.parse(`${DiffOriginContentProvider.scheme}:${id}`).with({
        query: Buffer.from(originalContent ?? "").toString("base64"),
        fragment: fileUri.fsPath,
      }),
      fileUri,
      `${fileName}: ${fileExists ? "Original ↔ Pochi's Changes" : "New File"} (Editable)`,
      {
        preview: false,
        preserveFocus: true,
      },
    );
    // This may happen on very slow machines ie project idx
    setTimeout(() => {
      disposable.dispose();
      reject(new Error("Failed to open diff editor, please try again..."));
    }, 10_000);
  });
}

async function closeAllNonDirtyDiffViews() {
  const tabs = vscode.window.tabGroups.all
    .flatMap((tg) => tg.tabs)
    .filter(
      (tab) =>
        tab.input instanceof vscode.TabInputTextDiff &&
        tab.input?.original?.scheme === DiffOriginContentProvider.scheme,
    );
  for (const tab of tabs) {
    // trying to close dirty views results in save popup
    if (!tab.isDirty) {
      await vscode.window.tabGroups.close(tab);
    }
  }
}

let needFocusDiffViews = false;

async function focusDiffViews() {
  for (const diffView of DiffViewMap.values()) {
    await diffView.focus();
  }
}

function handleTabChanges(e: vscode.TabChangeEvent) {
  // Only handle close events
  if (e.closed.length === 0) return;

  const visibleDiffViewIds = new Set<string>();
  for (const group of vscode.window.tabGroups.all) {
    for (const tab of group.tabs) {
      if (
        tab.input instanceof vscode.TabInputTextDiff &&
        tab.input.original.scheme === DiffOriginContentProvider.scheme
      ) {
        // id is stored in path
        visibleDiffViewIds.add(tab.input.original.path);
      }
    }
  }

  // Collect IDs to remove to avoid deleting during iteration
  const idsToRemove = new Set<string>();
  const filePathsToClose = new Set<string>();

  // Find diff views that are no longer visible and collect their file paths
  for (const [id, diffView] of DiffViewMap) {
    if (!visibleDiffViewIds.has(id)) {
      idsToRemove.add(id);
      filePathsToClose.add(diffView.fileUri.fsPath);
    }
  }

  // Add all diff views for the same file paths to removal list (for reuse cleanup)
  for (const [id, diffView] of DiffViewMap) {
    if (filePathsToClose.has(diffView.fileUri.fsPath)) {
      idsToRemove.add(id);
    }
  }

  // Now safely dispose and remove all marked diff views
  for (const id of idsToRemove) {
    const diffView = DiffViewMap.get(id);
    if (diffView) {
      diffView.dispose();
      DiffViewMap.delete(id);
      logger.debug(`Closed diff view for ${id}`);
    }
  }

  logger.debug(`Remaining diff views: ${DiffViewMap.size}`);
  if (DiffViewMap.size === 0 && DiffViewDisposable) {
    logger.debug("Disposing diff view hook");
    DiffViewDisposable.dispose();
    DiffViewDisposable = undefined;
  }

  if (needFocusDiffViews) {
    logger.debug("Focusing remaining diff views");
    needFocusDiffViews = false;
    focusDiffViews();
  }
}

async function discardChangesWithWorkspaceEdit(
  textDocument: vscode.TextDocument,
  originalContent: string,
) {
  if (textDocument.isDirty) {
    const fullRange = new vscode.Range(
      textDocument.positionAt(0),
      textDocument.positionAt(textDocument.getText().length),
    );

    const edit = new vscode.WorkspaceEdit();
    edit.replace(textDocument.uri, fullRange, originalContent);
    await vscode.workspace.applyEdit(edit);
    await textDocument.save();
  }
}
