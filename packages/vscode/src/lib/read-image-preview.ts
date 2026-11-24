import * as os from "node:os";
import path from "node:path";
import { getLogger } from "@/lib/logger";
import { readMediaFile } from "@getpochi/common/tool-utils";
import * as vscode from "vscode";

const logger = getLogger("readImagePreview");

export type ReadImagePreviewOptions = {
  fallbackGlobPattern?: string;
};

export async function readImagePreview(
  filePath: string,
  cwd: string | null | undefined,
  options?: ReadImagePreviewOptions,
): Promise<{ dataUrl: string } | null> {
  try {
    let resolvedPath = filePath;
    let fileUri = vscode.Uri.parse(resolvedPath);

    if (fileUri.scheme !== "pochi") {
      if (resolvedPath.startsWith("~/")) {
        resolvedPath = resolvedPath.replace(/^~/, os.homedir());
      }

      fileUri = path.isAbsolute(resolvedPath)
        ? vscode.Uri.file(resolvedPath)
        : cwd
          ? vscode.Uri.joinPath(vscode.Uri.file(cwd), resolvedPath)
          : vscode.Uri.file(resolvedPath);
    }

    let targetUri: vscode.Uri | undefined = fileUri;
    try {
      await vscode.workspace.fs.stat(targetUri);
    } catch {
      targetUri = undefined;
      if (options?.fallbackGlobPattern) {
        const result = await vscode.workspace.findFiles(
          options.fallbackGlobPattern,
          null,
          1,
        );
        if (result.length > 0) {
          targetUri = result[0];
        }
      }
    }

    if (!targetUri) {
      return null;
    }

    const fileBuffer = await vscode.workspace.fs.readFile(targetUri);
    const media = readMediaFile(targetUri.path || resolvedPath, fileBuffer, [
      "image/*",
    ]);
    return {
      dataUrl: `data:${media.mimeType};base64,${media.data}`,
    };
  } catch (error) {
    logger.debug(`Failed to read image preview for ${filePath}`, error);
    return null;
  }
}
