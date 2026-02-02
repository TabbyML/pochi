import { ReviewController } from "@/integrations/review-controller";
import { resolvePath } from "@getpochi/common/tool-utils";
import type { ClientTools, ToolFunctionType } from "@getpochi/tools";
import { container } from "tsyringe";
import * as vscode from "vscode";

export const createReview: ToolFunctionType<
  ClientTools["createReview"]
> = async ({ path, startLine, endLine, comment }, { cwd }) => {
  const reviewController = container.resolve(ReviewController);
  const resolvedPath = resolvePath(path, cwd);
  const uri = vscode.Uri.file(resolvedPath);

  // Convert to 0-indexed lines for VSCode
  const startLineIdx = startLine - 1;
  const endLineIdx = (endLine ?? startLine) - 1;

  const range = new vscode.Range(startLineIdx, 0, endLineIdx, 0);

  const thread = await reviewController.createThread(uri, range, comment);

  return {
    success: true,
    reviewId: thread.id,
  };
};
