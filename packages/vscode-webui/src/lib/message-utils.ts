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
  for (const x of files) {
    parts.push({
      type: "text",
      text: prompts.createSystemReminder(`Attached file: ${x.filename}`),
    });
    parts.push(x);
  }

  const getFallbackPrompt = () => {
    let fallbackPrompt = "";
    if (files.length) {
      fallbackPrompt = t("chat.pleaseCheckFiles");
    } else if (reviews.length) {
      fallbackPrompt = t("chat.pleaseCheckReviews");
    }
    return fallbackPrompt;
  };

  parts.push({ type: "text", text: prompt || getFallbackPrompt() });
  return parts;
}

export function getFilePrompt(file: FileUIPart, index: number): string {
  const filename = file.filename || `file-${index}`;
  if (file.url.startsWith("http")) {
    return `[${filename}](${file.url})`;
  }
  return filename;
}
