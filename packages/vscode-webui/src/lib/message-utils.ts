import { prompts } from "@getpochi/common";
import type { Review } from "@getpochi/common/vscode-webui-bridge";
import type { Message } from "@getpochi/livekit";
import type { FileUIPart } from "ai";
import type { useTranslation } from "react-i18next";

export function prepareMessageParts(
  t: ReturnType<typeof useTranslation>["t"],
  prompt: string,
  files: FileUIPart[],
  reviews: Review[],
) {
  const parts: Message["parts"] = [];
  if (files.length) {
    for (const x of files) {
      parts.push({
        type: "text",
        text: prompts.createSystemReminder(`Attached file: ${x.filename}`),
      });
      parts.push(x);
    }
    parts.push({ type: "text", text: prompt || t("chat.pleaseCheckFiles") });
  }

  if (reviews.length && !parts.length) {
    parts.push({ type: "text", text: prompt || t("chat.pleaseCheckReviews") });
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
