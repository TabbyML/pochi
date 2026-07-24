import { prompts } from "@getpochi/common";
import type {
  ActiveSelection,
  Review,
  TerminalTextSelection,
  UserEdits,
} from "@getpochi/common/vscode-webui-bridge";
import type { Message } from "@getpochi/livekit";
import type { FileUIPart } from "ai";
import type { TFunction } from "i18next";
import { vscodeHost } from "./vscode";

export function prepareMessageParts(
  t: TFunction,
  prompt: string,
  files: FileUIPart[],
  reviews: Review[],
  userEdits?: UserEdits,
  activeSelection?: ActiveSelection,
  activeTerminalTextSelection?: TerminalTextSelection,
) {
  const parts: Message["parts"] = [];
  for (const x of files) {
    parts.push({
      type: "text",
      text: prompts.createSystemReminder(
        `Attached file: ${x.filename} (${x.url})`,
      ),
    });
    parts.push(x);
  }

  if (reviews.length) {
    parts.push({
      type: "data-reviews",
      data: {
        reviews: [...reviews],
      },
    });
    vscodeHost.deleteReviews(reviews.map((r) => r.id));
  }

  if (userEdits) {
    parts.push({
      type: "data-user-edits",
      data: { userEdits },
    });
  }

  if (activeSelection || activeTerminalTextSelection) {
    parts.push({
      type: "data-active-selection",
      data: { activeSelection, activeTerminalTextSelection },
    });
  }

  let fallbackPrompt = "";
  if (files.length) {
    fallbackPrompt = t("chat.pleaseCheckFiles") as string;
  }

  const finalPrompt = prompt || fallbackPrompt;
  if (finalPrompt) {
    parts.push({ type: "text", text: finalPrompt });
  }

  return parts;
}

export function getFilePrompt(file: FileUIPart, index: number): string {
  const filename = file.filename || `file-${index}`;
  if (file.url.startsWith("http")) {
    return `[${filename}](${file.url})`;
  }
  return filename;
}
