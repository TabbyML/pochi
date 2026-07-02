import { getLogger } from "@getpochi/common";
import {
  parseDiffAndApply,
  processMultipleDiffs,
} from "@getpochi/common/diff-utils";
import { resolvePath } from "@getpochi/common/tool-utils";
import * as vscode from "vscode";
import { createPrettyPatch } from "./fs";
import { getEditSummary } from "./write-text-document";

const logger = getLogger("PreviewEdit");

export type PreviewEditResult = {
  edit: string;
  editSummary: { added: number; removed: number };
};

/**
 * Compute a preview diff for a file-editing tool call (applyDiff, multiApplyDiff,
 * writeToFile) WITHOUT writing to disk. This is used to show the diff before the
 * user approves the tool call.
 *
 * Preview is best-effort: if the edit cannot be computed (e.g. the search content
 * does not match the current file content), `undefined` is returned instead of
 * throwing, as the real execution will surface the error.
 */
export async function computePreviewEdit(
  toolName: string,
  input: unknown,
  cwd: string,
): Promise<PreviewEditResult | undefined> {
  if (!input || typeof input !== "object") {
    return undefined;
  }

  const args = input as Record<string, unknown>;
  const path = args.path;
  if (typeof path !== "string" || path.length === 0) {
    return undefined;
  }

  try {
    let fileUri = vscode.Uri.parse(path);
    if (fileUri.scheme !== "pochi") {
      fileUri = vscode.Uri.file(resolvePath(path, cwd));
    }

    const fileContent = await readFileContentSafe(fileUri);

    let updatedContent: string;
    switch (toolName) {
      case "writeToFile": {
        if (typeof args.content !== "string") {
          return undefined;
        }
        updatedContent = args.content;
        break;
      }
      case "applyDiff": {
        if (
          typeof args.searchContent !== "string" ||
          typeof args.replaceContent !== "string"
        ) {
          return undefined;
        }
        updatedContent = await parseDiffAndApply(
          fileContent,
          args.searchContent,
          args.replaceContent,
          typeof args.expectedReplacements === "number"
            ? args.expectedReplacements
            : undefined,
        );
        break;
      }
      case "multiApplyDiff": {
        if (!Array.isArray(args.edits)) {
          return undefined;
        }
        updatedContent = await processMultipleDiffs(
          fileContent,
          args.edits as Array<{
            searchContent: string;
            replaceContent: string;
            expectedReplacements?: number;
          }>,
        );
        break;
      }
      default:
        return undefined;
    }

    if (updatedContent === fileContent) {
      return undefined;
    }

    return {
      edit: createPrettyPatch(path, fileContent, updatedContent),
      editSummary: getEditSummary(fileContent, updatedContent),
    };
  } catch (error) {
    logger.debug(`Failed to preview edit for ${toolName}`, error);
    return undefined;
  }
}

async function readFileContentSafe(fileUri: vscode.Uri): Promise<string> {
  try {
    const buffer = await vscode.workspace.fs.readFile(fileUri);
    return new TextDecoder().decode(buffer);
  } catch {
    // File does not exist yet (e.g. creating a new file) -> treat as empty.
    return "";
  }
}
