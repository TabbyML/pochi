import { z } from "zod";
import type { SubTask } from "./new-task";
import { defineClientTool } from "./types";

export const CustomAgent = z.object({
  name: z.string().describe("The name of the custom agent."),
  description: z.string().describe("A brief description of the custom agent."),
  tools: z
    .array(z.string())
    .optional()
    .describe("List of tools the agent can use."),
  systemPrompt: z.string().describe("The system prompt for the custom agent."),
});

export type CustomAgent = z.infer<typeof CustomAgent>;

const generalPurposeAgent: CustomAgent = {
  name: "general-purpose",
  description:
    "General-purpose agent for researching complex questions, searching for code, and executing multi-step tasks. When you are searching for a keyword or file and are not confident that you will find the right match in the first few tries use this agent to perform the search for you.",
  systemPrompt: "You are a general purpose agent.",
};

export const overrideCustomAgentTools = (
  customAgent: CustomAgent | undefined,
): CustomAgent | undefined => {
  if (!customAgent) return undefined;
  if (!customAgent.tools || customAgent.tools.length === 0) {
    return { ...customAgent, tools: undefined };
  }

  const toAddTools = ["todoWrite", "attemptCompletion"];
  const toDeleteTools = ["askFollowupQuestion", "newTask", "newCustomAgent"];

  const updatedTools = customAgent.tools.filter(
    (tool) => !toDeleteTools.includes(tool) && !toAddTools.includes(tool),
  );
  return { ...customAgent, tools: [...updatedTools, ...toAddTools] };
};

export const newCustomAgent = (customAgents?: CustomAgent[]) =>
  defineClientTool({
    description: `Launch a new agent to handle complex, multi-step tasks autonomously.
Available agent types and the tools they have access to:
${[generalPurposeAgent, ...(customAgents ?? [])].map((agent) => `- ${agent.name}: ${agent.description} (Tools: ${agent.tools && agent.tools.length > 0 ? agent.tools.join(", ") : "*"})`).join("\n")}

When using the newCustomAgent tool, you must specify a agentType parameter to select which agent type to use.

When NOT to use the Agent tool:
- If you want to read a specific file path, use the readFile or globFiles tool instead of the newCustomAgent tool, to find the match more quickly
- If you are searching for a specific class definition like "class Foo", use the globFiles tool instead, to find the match more quickly
- If you are searching for code within a specific file or set of 2-3 files, use the readFile tool instead of the Agent tool, to find the match more quickly
- Other tasks that are not related to the agent descriptions above

Usage notes:
1. Launch multiple agents concurrently whenever possible, to maximize performance; to do that, use a single message with multiple tool uses
2. When the agent is done, it will return a single message back to you. The result returned by the agent is not visible to the user. To show the user the result, you should send a text message back to the user with a concise summary of the result.
3. Each agent invocation is stateless. You will not be able to send additional messages to the agent, nor will the agent be able to communicate with you outside of its final report. Therefore, your prompt should contain a highly detailed task description for the agent to perform autonomously and you should specify exactly what information the agent should return back to you in its final and only message to you.
4. The agent's outputs should generally be trusted
5. Clearly tell the agent whether you expect it to write code or just to do research (search, file reads, web fetches, etc.), since it is not aware of the user's intent
6. If the agent description mentions that it should be used proactively, then you should try your best to use it without the user having to ask for it first. Use your judgement.

Example usage:

<example_agent_descriptions>
"code-reviewer": use this agent after you are done writing a signficant piece of code
"greeting-responder": use this agent when to respond to user greetings with a friendly joke
</example_agent_description>

<example>
user: "Please write a function that checks if a number is prime"
assistant: Sure let me write a function that checks if a number is prime
assistant: First let me use the Write tool to write a function that checks if a number is prime
assistant: I'm going to use the Write tool to write the following code:
<code>
function isPrime(n) {
  if (n <= 1) return false
  for (let i = 2; i * i <= n; i++) {
    if (n % i === 0) return false
  }
  return true
}
</code>
<commentary>
Since a signficant piece of code was written and the task was completed, now use the code-reviewer agent to review the code
</commentary>
assistant: Now let me use the code-reviewer agent to review the code
assistant: Uses the Task tool to launch the with the code-reviewer agent 
</example>

<example>
user: "Hello"
<commentary>
Since the user is greeting, use the greeting-responder agent to respond with a friendly joke
</commentary>
assistant: "I'm going to use the Task tool to launch the with the greeting-responder agent"
</example>
      `,
    inputSchema: z.object({
      description: z.string().describe("A short description of the task."),
      prompt: z
        .string()
        .describe("The detailed prompt for the task to be performed."),
      agentType: z
        .string()
        .describe("The type of the custom agent to use for the task."),
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
    }),
    outputSchema: z.object({
      result: z
        .string()
        .describe(
          "The result of the task, submitted through the `attemptCompletion` tool.",
        ),
    }),
  });
