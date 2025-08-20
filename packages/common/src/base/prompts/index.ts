import { createCompactPrompt } from "./compact";
import { createEnvironmentPrompt, injectEnvironment } from "./environment";
import { createSystemPrompt } from "./system";

export const prompts = {
  system: createSystemPrompt,
  injectEnvironment,
  environment: createEnvironmentPrompt,
  createSystemReminder,
  isSystemReminder,
  isCompact,
  compact: createCompactPrompt,
  inlineCompact,
  parseInlineCompact,
  generateTitle,
};

function createSystemReminder(content: string) {
  return `<system-reminder>${content}</system-reminder>`;
}

function isSystemReminder(content: string) {
  return (
    (content.startsWith("<system-reminder>") &&
      content.endsWith("</system-reminder>")) ||
    // Handle legacy data, user-reminder / environment-details
    (content.startsWith("<user-reminder>") &&
      content.endsWith("</user-reminder>")) ||
    (content.startsWith("<environment-details>") &&
      content.endsWith("</environment-details>"))
  );
}

function isCompact(content: string) {
  return content.startsWith("<compact>") && content.endsWith("</compact>");
}

function inlineCompact(summary: string, messageCount: number) {
  return `<compact>
Previous conversation summary (${messageCount} messages):
${summary}
This section contains a summary of the conversation up to this point to save context. The full conversation history has been preserved but condensed for efficiency.
</compact>`;
}

function parseInlineCompact(text: string) {
  const match = text.match(/^<compact>(.*)<\/compact>$/s);
  if (!match) return;
  return {
    summary: match[1],
  };
}

function generateTitle() {
  return "Based on the conversation above, create a concise and descriptive title for the task. The title should be a short sentence that summarizes the user's request and should NOT end with any punctuation marks (e.g., periods, question marks). Do NOT use markdown formatting, bullet points, or numbered lists. Avoid creating complex structured templates. Return only the title itself, without any explanations, comments, headings, or special formatting.";
}
