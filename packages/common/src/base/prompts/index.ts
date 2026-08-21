import { renderActiveSelection } from "./active-selection";
import { buildAttemptTodoCompletionPrompt } from "./attempt-todo-completion";
export { assertBackgroundJobReadInterval } from "./background-job";
import {
  buildAutoMemoryDreamDirective,
  buildAutoMemoryDynamicPrompt,
  buildAutoMemoryExtractionDirective,
  buildAutoMemoryPrompt,
  buildAutoMemoryStaticPrompt,
  formatAutoMemoryManifest,
  injectAutoMemory,
  isAutoMemorySystemReminder,
  serializeMemoryMessage,
  truncateAutoMemoryIndex,
} from "./auto-memory";
import { renderBackgroundJobNotification } from "./background-job-notification";
import { renderBashOutputs } from "./bash-outputs";
import { createCompactPrompt } from "./compact";
import { createEnvironmentPrompt, injectEnvironment } from "./environment";
import { fixMermaidError } from "./fix-mermaid-error";
import { generateTitle } from "./generate-title";
import { renderReviewComments } from "./review-comments";
import {
  createSkillPrompt,
  createSkillSystemReminder,
  createUseSkillResult,
} from "./skill";
import { createSystemPrompt } from "./system";
import {
  buildMemoryExtractionDirective,
  taskMemoryTemplate,
} from "./task-memory";
import { renderTerminalContext } from "./terminal-context";
import { renderUserEdits } from "./user-edits";

export { parseEnvironmentInfo } from "./environment";

export const prompts = {
  system: createSystemPrompt,
  injectEnvironment,
  injectAutoMemory,
  environment: createEnvironmentPrompt,
  createSystemReminder,
  isSystemReminder,
  isEnvironmentSystemReminder,
  isAutoMemorySystemReminder,
  isCompact,
  compact: createCompactPrompt,
  inlineCompact,
  parseInlineCompact,
  generateTitle,
  customAgentSystemReminder: createCustomAgentSystemReminder,
  skill: createSkillPrompt,
  skillSystemReminder: createSkillSystemReminder,
  renderReviewComments,
  renderActiveSelection,
  renderTerminalContext,
  renderUserEdits,
  renderBashOutputs,
  renderBackgroundJobNotification,
  fixMermaidError,
  createUseSkillResult,
  attemptTodoCompletion: {
    buildPrompt: buildAttemptTodoCompletionPrompt,
  },
  taskMemory: {
    template: taskMemoryTemplate,
    buildExtractionDirective: buildMemoryExtractionDirective,
  },
  autoMemory: {
    buildPrompt: buildAutoMemoryPrompt,
    buildStaticPrompt: buildAutoMemoryStaticPrompt,
    buildDynamicPrompt: buildAutoMemoryDynamicPrompt,
    buildExtractionDirective: buildAutoMemoryExtractionDirective,
    buildDreamDirective: buildAutoMemoryDreamDirective,
    formatManifest: formatAutoMemoryManifest,
    truncateIndex: truncateAutoMemoryIndex,
    serializeMessage: serializeMemoryMessage,
  },
  toolCallsReminder: `You should use tool calls to answer the question, for example, use attemptCompletion if the job is done, or use askFollowupQuestion to clarify the request.

If you have already provided a response or explanation in your text above, do NOT repeat or copy that content into the \`result\` parameter of \`attemptCompletion\`. Instead, simply refer to your response above with a brief sentence (e.g., "See response above." or "The task is completed as described above.") to save output tokens.`,
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
  return isSystemReminder(content) && content.includes("# GIT STATUS");
}

function isCompact(content: string) {
  return content.startsWith("<compact>") && content.endsWith("</compact>");
}

function inlineCompact(
  summary: string,
  messageCount: number,
  appendix?: string,
  options?: { verbatimTail?: boolean },
) {
  const appendixText = appendix ? `\n\n${appendix}` : "";
  const epilogue = options?.verbatimTail
    ? "This section summarizes the older portion of the conversation. The most recent turns that follow this block have NOT been condensed — they are the original messages preserved verbatim. Use them as the source of truth for recent activity."
    : "This section contains a summary of the conversation up to this point to save context. The full conversation history has been preserved but condensed for efficiency.";
  return `<compact>
Previous conversation summary (${messageCount} messages):
${summary}
${epilogue}${appendixText}
</compact>`;
}

function parseInlineCompact(text: string) {
  const match = text.match(/^<compact>(.*)<\/compact>$/s);
  if (!match) return;
  return {
    summary: match[1],
  };
}

function createCustomAgentSystemReminder(agentName: string) {
  const escapedAgentName = agentName.replace(
    /<\/?system-reminder\b[^>]*>/gi,
    (match) => match.replace("<", "&lt;"),
  );
  return createSystemReminder(
    `The user explicitly invoked the "${escapedAgentName}" agent. You must use the newTask tool with agentType="${escapedAgentName}" to run it, passing the complete relevant request and context.`,
  );
}
