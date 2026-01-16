import { getLogger } from "@getpochi/common";
import * as diff from "diff";
import * as vscode from "vscode";
import { compareDiagnostics, diagnosticsToProblemsString } from "./diagnostic";
import {
  createPrettyPatch,
  ensureFileDirectoryExists,
  isFileExists,
  resolveFileUri,
} from "./fs";
import type { EncodedTask } from "./task-history-store";

const logger = getLogger("WriteTextDocument");

export async function writeTextDocument(
  path: string,
  content: string,
  cwd: string,
  abortSignal?: AbortSignal,
  task?: EncodedTask | null,
) {
  logger.debug(`Will write to ${path}, content length: ${content.length}`);
  const fileUri = resolveFileUri(path, { cwd, task });
  const fileExists = await isFileExists(fileUri);
  if (!fileExists) {
    await ensureFileDirectoryExists(fileUri);
    await vscode.workspace.fs.writeFile(fileUri, Buffer.from("", "utf-8"));
  }

  const textDocument = await vscode.workspace.openTextDocument(fileUri);
  const preEditContent = textDocument.getText();
  await waitForDiagnostic(abortSignal);
  const preEditDiagnostics = vscode.languages.getDiagnostics();

  const edit = new vscode.WorkspaceEdit();
  edit.replace(
    fileUri,
    new vscode.Range(
      textDocument.positionAt(0),
      textDocument.positionAt(textDocument.getText().length),
    ),
    content,
  );
  await vscode.workspace.applyEdit(edit);
  await textDocument.save();
  const postSaveContent = textDocument.getText();
  await waitForDiagnostic(abortSignal);
  const postSaveDiagnostics = vscode.languages.getDiagnostics();

  const newContentEOL = content.includes("\r\n") ? "\r\n" : "\n";
  const normalizedNewContent =
    content.replace(/\r\n|\n/g, newContentEOL).trimEnd() + newContentEOL;
  const normalizedPostSaveContent =
    postSaveContent.replace(/\r\n|\n/g, newContentEOL).trimEnd() +
    newContentEOL;

  let autoFormattingEdits: string | undefined;
  if (normalizedNewContent !== normalizedPostSaveContent) {
    autoFormattingEdits = createPrettyPatch(
      path,
      normalizedNewContent,
      normalizedPostSaveContent,
    );
  }

  const {
    newProblems: newProblemsList,
    resolvedProblems: resolvedProblemsList,
  } = compareDiagnostics(preEditDiagnostics, postSaveDiagnostics);

  // only including errors since warnings can be distracting (if user wants to fix warnings they can use the @problems mention)
  const newProblems = diagnosticsToProblemsString(
    newProblemsList,
    [vscode.DiagnosticSeverity.Error],
    cwd,
  );
  const resolvedProblems = diagnosticsToProblemsString(
    resolvedProblemsList,
    [vscode.DiagnosticSeverity.Error],
    cwd,
  );

  const editSummary = getEditSummary(preEditContent, postSaveContent);
  const editDiff = createPrettyPatch(path, preEditContent, postSaveContent);

  logger.debug(
    `Wrote to ${path}, content length: ${postSaveContent.length}, edit summary: +${editSummary.added} -${editSummary.removed}`,
  );
  return {
    autoFormattingEdits,
    newProblems,
    _meta: { edit: editDiff, editSummary },
    _transient: resolvedProblems ? { resolvedProblems } : undefined,
  };
}

async function waitForDiagnostic(abortSignal?: AbortSignal) {
  if (process.env.VSCODE_TEST_OPTIONS) {
    // No waiting in test mode
    return;
  }
  const delay = 1000;
  abortSignal?.throwIfAborted();

  await new Promise<void>((resolve, reject) => {
    logger.debug(`Waiting ${delay}ms for diagnostics to update...`);
    const timeout = setTimeout(() => {
      resolve();
    }, delay);

    abortSignal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timeout);
        reject(abortSignal.reason);
      },
      { once: true },
    );
  });
}

export function getEditSummary(original: string, modified: string) {
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
