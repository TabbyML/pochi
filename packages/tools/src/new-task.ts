import type { UIMessage } from "ai";
import { z } from "zod";
import type { Todo } from "./todo-write";
import { defineClientTool } from "./types";

export type SubTask = {
  clientTaskId: string;
  messages: UIMessage[];
  todos: Todo[];
};

export const CustomAgent = z.object({
  name: z.string().describe("The name of the custom agent."),
  description: z.string().describe("A brief description of the custom agent."),
  tools: z
    .array(z.string())
    .optional()
    .describe("List of tools the agent can use."),
  systemPrompt: z.string().describe("The system prompt for the custom agent."),
  model: z
    .string()
    .optional()
    .describe("The model to use for the custom agent."),
});

export type CustomAgent = z.infer<typeof CustomAgent>;

export const overrideCustomAgentTools = (
  customAgent: CustomAgent | undefined,
): CustomAgent | undefined => {
  if (!customAgent) return undefined;
  if (!customAgent.tools || customAgent.tools.length === 0) {
    return { ...customAgent, tools: undefined };
  }

  const toAddTools = ["todoWrite", "attemptCompletion"];
  const toDeleteTools = ["askFollowupQuestion", "newTask"];

  const updatedTools = customAgent.tools.filter(
    (tool) => !toDeleteTools.includes(tool) && !toAddTools.includes(tool),
  );
  return { ...customAgent, tools: [...updatedTools, ...toAddTools] };
};

function makeCustomAgentToolDescription(customAgents?: CustomAgent[]) {
  if (!customAgents || customAgents.length === 0)
    return "No custom agents are available. You shall always leave the agentType parameter empty to use the default agent.";

  return `When using the newTask tool, you may specify a agentType parameter to select which agent type to use.
Available agent types and the tools they have access to:

${(customAgents ?? [])
  .map((agent) => `### ${agent.name}\n${agent.description.trim()}`)
  .join("\n\n")}
`;
}

export const inputSchema = z.object({
  description: z.string().describe("A short description of the task."),
  prompt: z
    .string()
    .describe("The detailed prompt for the task to be performed."),
  agentType: z
    .string()
    .optional()
    .describe("The type of the specialized agent to use for the task."),
  _meta: z
    .object({
      uid: z.string().describe("A unique identifier for the task."),
    })
    .optional(),
  _transient: z
    .object({
      task: z.custom<SubTask>().describe("The inlined subtask result."),
    })
    .optional(),
});

export const createNewTaskTool = (customAgents?: CustomAgent[]) =>
  defineClientTool({
    description:
      `Launch a new agent to handle complex, multi-step tasks autonomously.
${makeCustomAgentToolDescription(customAgents)}

Always include a reminder in your prompt to ensure the result will be submitted through the \`attemptCompletion\` tool.
If the task stops without submitting the result, it will return an error message.

When NOT to use the newTask tool:
- If you want to read a specific file path, use the readFile or globFiles tool instead of the newTask tool, to find the match more quickly
- If you are searching for a specific class definition like "class Foo", use the globFiles tool instead, to find the match more quickly
- If you are searching for code within a specific file or set of 2-3 files, use the readFile tool instead of the newTask tool, to find the match more quickly
- Other tasks that are not related to the agent descriptions above

Usage notes:
1. Launch multiple agents tools concurrently whenever possible to maximize performance; to do that, use a single message with multiple tool uses
2. When the agent is done, it will return a single message back to you. The result returned by the agent is not visible to the user. To show the user the result, you should send a text message back to the user with a concise summary of the result.
3. Each agent invocation is stateless. You will not be able to send additional messages to the agent, nor will the agent be able to communicate with you outside of its final report. Therefore, your prompt should contain a highly detailed task description for the agent to perform autonomously and you should specify exactly what information the agent should return back to you in its final and only message to you.
4. The agent's outputs should generally be trusted
5. Clearly tell the agent whether you expect it to write code or just to do research (search, file reads, web fetches, etc.), since it is not aware of the user's intent
6. If the agent description mentions that it should be used proactively, then you should try your best to use it without the user having to ask for it first. Use your judgement.
      `.trim(),
    inputSchema,
    outputSchema: z.object({
      result: z
        .string()
        .describe(
          "The result of the task, submitted through the `attemptCompletion` tool.",
        ),
    }),
  });
