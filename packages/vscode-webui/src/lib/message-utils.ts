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
  terminalContextSelections?: TerminalTextSelection[],
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

  if (terminalContextSelections && terminalContextSelections.length > 0) {
    parts.push({
      type: "data-terminal-context",
      data: { textSelections: terminalContextSelections },
    });
  }

  const attachedContextLabels: string[] = [];
  if (files.length) {
    attachedContextLabels.push(t("chat.contextLabelFiles") as string);
  }
  if (reviews.length) {
    attachedContextLabels.push(t("chat.contextLabelReviews") as string);
  }
  if (terminalContextSelections?.length) {
    attachedContextLabels.push(
      t("chat.contextLabelTerminalSelections") as string,
    );
  }

  let fallbackPrompt = "";
  if (attachedContextLabels.length) {
    // Use the runtime's default locale (rather than importing the i18next
    // singleton) to avoid pulling i18n/config.ts - and its side-effecting
    // `.use(initReactI18next)` init call - into this module, which breaks
    // tests that partially mock "react-i18next".
    const items = new Intl.ListFormat(undefined, {
      style: "long",
      type: "conjunction",
    }).format(attachedContextLabels);
    fallbackPrompt = t("chat.pleaseCheckAttachedContext", { items }) as string;
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
