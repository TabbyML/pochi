import { createCompactPrompt } from "./compact";
import { createEnvironmentPrompt, injectEnvironment } from "./environment";
import { generateTitle } from "./generate-title";
import { injectBashOutputs } from "./inject-bash-outputs";
import { createSystemPrompt } from "./system";

export const prompts = {
  system: createSystemPrompt,
  injectEnvironment,
  environment: createEnvironmentPrompt,
  createSystemReminder,
  isSystemReminder,
  isEnvironmentSystemReminder,
  isCompact,
  compact: createCompactPrompt,
  inlineCompact,
  parseInlineCompact,
  generateTitle,
  workflow: createWorkflowPrompt,
  customAgent: createCustomAgentPrompt,
  injectBashOutputs,
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

function isEnvironmentSystemReminder(content: string) {
  // FIXME(meng): this is really a hack to detect if the system reminder is for environment details
  // We should have a better way to detect this
  return isSystemReminder(content) && content.includes("# TODOs");
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

function createWorkflowPrompt(id: string, path: string, content: string) {
  // Remove extra newlines from the content
  let processedContent = content.replace(/\n+/g, "\n");
  // Escape '<' to avoid </workflow> being interpreted as a closing tag
  const workflowTagRegex = /<\/?workflow\b[^>]*>/g;
  processedContent = processedContent.replace(workflowTagRegex, (match) => {
    return match.replace("<", "&lt;");
  });
  return `<workflow id="${id}" path="${path}">${processedContent}</workflow>`;
}

function createCustomAgentPrompt(id: string, path: string) {
  // Remove extra newlines from the id
  let processedAgentName = id.replace(/\n+/g, "\n");
  // Escape '<' to avoid </custom-agent> being interpreted as a closing tag
  const customAgentTagRegex = /<\/?custom-agent\b[^>]*>/g;
  processedAgentName = processedAgentName.replace(
    customAgentTagRegex,
    (match) => {
      return match.replace("<", "&lt;");
    },
  );
  return `<custom-agent id="${id}" path="${path}">newTask:${processedAgentName}</custom-agent>`;
}
