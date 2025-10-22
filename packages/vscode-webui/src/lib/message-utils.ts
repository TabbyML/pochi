import { prompts } from "@getpochi/common";
import type { Message } from "@getpochi/livekit";
import type { FileUIPart } from "ai";
import type { useTranslation } from "react-i18next";

export function prepareMessageParts(
  t: ReturnType<typeof useTranslation>["t"],
  prompt: string,
  files: FileUIPart[],
) {
  const parts: Message["parts"] = [...files];
  if (files.length > 0) {
    parts.push({
      type: "text",
      text: prompts.createSystemReminder(
        `Attached files: ${files.map(getFilePrompt).join(", ")}`,
      ),
    });
  }
  parts.push({ type: "text", text: prompt || t("chat.pleaseCheckFiles") });
  return parts;
}

export function getFilePrompt(file: FileUIPart, index: number): string {
  const filename = file.filename || `file-${index}`;
  if (file.url.startsWith("http")) {
    return `[${filename}](${file.url})`;
  }
  return filename;
}
