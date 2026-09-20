import { renderActiveSelection } from "./active-selection";
import { buildAttemptTodoCompletionPrompt } from "./attempt-todo-completion";
export { assertBackgroundJobReadInterval } from "./background-job";
import type { PastedTextFile } from "../message";
import {
  buildAutoMemoryDreamDirective,
  buildAutoMemoryDynamicPrompt,
  buildAutoMemoryExtractionDirective,
  buildAutoMemoryPrompt,
  buildAutoMemoryStaticPrompt,
  formatAutoMemoryManifest,
  injectAutoMemory,
  isAutoMemorySystemReminder,
  renderAutoMemoryIndex,
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

export {
  parseEnvironmentInfo,
  parseEnvironmentInfoResult,
} from "./environment";

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
  pastedTextFileReferences,
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
    renderIndex: renderAutoMemoryIndex,
    truncateIndex: truncateAutoMemoryIndex,
    serializeMessage: serializeMemoryMessage,
  },
  stepBudgetReminder: createStepBudgetReminder,
  incompleteResponseReminder:
    "The previous response was not received completely. Please continue using the conversation history and tool results available here. Complete any missing content or unfinished tool calls without repeating completed work.",
  toolCallsReminder: `You should use tool calls to answer the question, for example, use attemptCompletion if the job is done, or use askFollowupQuestion to clarify the request.

If you have already provided a response or explanation in your text above, do NOT repeat or copy that content into the \`result\` parameter of \`attemptCompletion\`. Instead, simply refer to your response above with a brief sentence (e.g., "See response above." or "The task is completed as described above.") to save output tokens.`,
};

function pastedTextFileReferences(files: readonly PastedTextFile[]) {
  if (files.length === 0) return "";

  return `Referenced pasted text files:\n${files
    .map(
      ({ filePath }) =>
        `- pasted text file: ${filePath}. Read this file before continuing.`,
    )
    .join("\n")}`;
}

function createSystemReminder(content: string) {
  return `<system-reminder>${content}</system-reminder>`;
}

/**
 * Warns a step-bounded task that it is about to run out of assistant turns.
 *
 * The budget is otherwise unobservable to the model: fork agents replay the
 * parent conversation, so the model cannot infer its remaining turns from the
 * message history.
 */
function createStepBudgetReminder({
  remainingSteps,
  maxSteps,
}: {
  remainingSteps: number;
  maxSteps: number;
}) {
  if (remainingSteps <= 1) {
    return `This is the LAST assistant turn available for this task (limit ${maxSteps} turns). Do not start new work and do not make further edits. Call attemptCompletion now, summarizing what was finished and what was left undone — otherwise the task is recorded as failed and the work already done is not reported.`;
  }

  return `Only ${remainingSteps} assistant turns remain for this task (limit ${maxSteps} turns). Finish up: emit any remaining tool calls together in a single turn, and keep the final turn for attemptCompletion.`;
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
