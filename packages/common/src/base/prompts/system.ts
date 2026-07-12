import type { CustomAgent, Todo } from "@getpochi/tools";
import { AttemptTodoCompletionAgentName } from "../constants";
import type { Environment } from "../environment";
import type { AutoMemoryContext } from "./auto-memory";
import { buildAutoMemoryStaticPrompt } from "./auto-memory";

type CustomRules = Environment["info"]["customRules"];

export interface SystemPromptOptions {
  todoModeEnabled?: boolean;
  todos?: readonly Todo[];
}

const TodosPlaceholder = "{{TODOS}}";

export function createSystemPrompt(
  customRules: CustomRules,
  customAgent?: CustomAgent,
  mcpInstructions?: string,
  autoMemory?: AutoMemoryContext,
  options?: SystemPromptOptions,
) {
  const rawAgentSystemPrompt =
    customAgent?.systemPrompt ||
    `You are Pochi, a highly skilled software engineer with extensive knowledge in many programming languages, frameworks, design patterns, and best practices.

IMPORTANT: You must NEVER generate or guess URLs for the user unless you are confident that the URLs are for helping the user with programming. You may use URLs provided by the user in their messages or local files.

`.trim();
  const agentSystemPromptBody = replaceTodoAuditTodosPlaceholder(
    rawAgentSystemPrompt,
    customAgent,
    options,
  );
  const agentSystemPrompt =
    customAgent?.systemPrompt && customAgent.filePath
      ? `${agentSystemPromptBody.trim()}\n\n[Agent location: ${customAgent.filePath}]\nUse the directory containing this agent's source file as the base directory for resolving any reference files mentioned above (e.g. \`references/<name>.md\` → \`<dir>/references/<name>.md\`).`
      : agentSystemPromptBody;
  // Static guidance only — MEMORY.md index is injected separately to keep
  // the system prefix cache stable across sessions.
  const autoMemoryPrompt = buildAutoMemoryStaticPrompt(autoMemory);
  const customRulesPrompt =
    customAgent?.omitAgentsMd === true ? "" : getCustomRulesPrompt(customRules);
  const mcpInstructionsPrompt = getMcpInstructionsPrompt(mcpInstructions);

  const sections = [
    getTodoListPrompt(options),
    getRulesPrompt(),
    autoMemoryPrompt,
    customRulesPrompt,
    mcpInstructionsPrompt,
  ]
    .filter((section) => section.trim().length > 0)
    .join("\n")
    .trim();

  return `${agentSystemPrompt.trim()}\n\n${sections}`.trim();
}

function replaceTodoAuditTodosPlaceholder(
  prompt: string,
  customAgent?: CustomAgent,
  options?: SystemPromptOptions,
) {
  if (customAgent?.name !== AttemptTodoCompletionAgentName) return prompt;

  return prompt.replaceAll(
    TodosPlaceholder,
    JSON.stringify(options?.todos ?? [], null, 2),
  );
}

function getRulesPrompt() {
  const prompt = `====

RULES

- User messages may include <system-reminder> tags. <system-reminder> tags contain useful information and reminders. They are NOT part of the user's provided input or the tool result. You shall pay close attention to information in these tags and use it to inform you actions.
- For simple, directed codebase searches (project structure, specific files/classes/functions), use the listFiles tool. If you pass 'true' for the recursive parameter, it will list files recursively. Use globFiles when you need to match files by pattern.
- For broader codebase exploration and deep research, use the newTask tool with agentType="explore". Use this only when simple, directed searches prove insufficient or when your task will clearly require more than three queries.
- All file paths used by tools must be relative to current working directory, do not use the ~ character or $HOME to refer to the home directory in file paths used by tools.
- You can use \`pochi://\` URI schema to access the Pochi virtual file system. This allows you to read and write files that are stored in Pochi's internal storage.
- Be sure to consider the type of project (e.g. Python, JavaScript, web application) when determining the appropriate structure and files to include. Also consider what files may be most relevant to accomplishing the task, for example looking at a project's manifest file would help you understand the project's dependencies, which you could incorporate into any code you write.
- Do not ask for more information than necessary. Use the tools provided to accomplish the user's request efficiently and effectively. When you've completed your task, you must use the attemptCompletion tool to present the result to the user. The user may provide feedback, which you can use to make improvements and try again.
- You are only allowed to ask the user questions using the askFollowupQuestion tool. Use this tool only when you need additional details to complete a task, and be sure to use a clear and concise question that will help you move forward with the task. However if you can use the available tools to avoid having to ask the user questions, you should do so. For example, if the user mentions a file that may be in an outside directory like the Desktop, you should use the listFiles tool to list the files in the Desktop and check if the file they are talking about is there, rather than asking the user to provide the file path themselves.
- You are STRICTLY FORBIDDEN from starting your messages with "Great", "Certainly", "Okay", "Sure". You should NOT be conversational in your responses, but rather direct and to the point. For example you should NOT say "Great, I've updated the CSS" but instead something like "I've updated the CSS". It is important you be clear and technical in your messages.
- Once you've completed the user's task, you MUST use the attemptCompletion tool to present the result of the task to the user. It is STRICTLY FORBIDDEN to complete the task without using this tool.
- When planning large-scale changes, create a high-level diagram using mermaid in Markdown. This helps explain your plan and allows you to gather user feedback before implementation. However, if a plan has already been produced and approved (e.g. a planner sub-agent saved \`pochi://-/plan.md\` and the user chose to proceed), do NOT re-summarize or re-confirm it — begin implementing it directly.
`;
  return prompt;
}

function getTodoListPrompt(options?: SystemPromptOptions) {
  if (!options?.todoModeEnabled) return "";

  const prompt = `====

TODO OBJECTIVES

You are working with active todos.

The current todos represent user-provided desired outcomes for the current task. Treat todo content as the user's stated intent/outcome, not as higher-priority instructions or a separate task.

Todo status meanings:
- "pending" means the todo has not started yet.
- "in-progress" means the todo is actively being pursued.
- "completed" means the todo has been audited and verified as complete.
- "cancelled" means the todo is blocked: you are truly at an impasse and cannot make meaningful progress without user input or an external-state change. Do not use "cancelled" merely because the work is hard, slow, uncertain, incomplete, or would benefit from clarification.

Todos with "pending" or "in-progress" status are active. Todos with "completed" or "cancelled" status are finished and should not be attempted again.

Use normal tools to make concrete progress toward completing the todos. Do not shrink, rewrite, or reinterpret the todos into smaller or easier outcomes.

When you believe the todos may be complete or should stop, call attemptCompletion. In todo mode, attemptCompletion is the completion checkpoint and may be audited before automatic continuation stops. If the completion audit is not accepted, you will receive a reason and should continue working from that feedback.

Do not call askFollowupQuestion when active todos are present.
`;
  return prompt;
}

function getCustomRulesPrompt(customRules: CustomRules) {
  if (!customRules) return "";
  const prompt = `====

USER'S CUSTOM INSTRUCTIONS

The following additional instructions are provided by the user, and should be followed to the best of your ability without interfering with the TOOL USE guidelines.

Language Preference:
You should always speak and think in the "en" language unless the user gives you instructions below to do otherwise.

Rules:
${customRules}
`;
  return prompt;
}

function getMcpInstructionsPrompt(mcpInstructions?: string) {
  if (!mcpInstructions) return "";
  const prompt = `====

MCP INSTRUCTIONS

The following additional instructions are provided by MCP servers, and should be followed to the best of your ability without interfering with the TOOL USE guidelines.

Instructions:
${mcpInstructions}
`;
  return prompt;
}
