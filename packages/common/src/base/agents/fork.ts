import type { CustomAgent } from "@getpochi/tools";

export const fork: CustomAgent = {
  name: "fork",
  description: `
Fork agent that inherits the parent conversation's full context. Use this when the child task needs to understand the ongoing conversation to complete its work effectively. Ideal for parallel, independent sub-tasks that share the parent's understanding of the problem.

**When to use fork vs other agents:**
- Use \`fork\` when the task requires understanding the current conversation context
  (e.g., "fix the other lint error I mentioned", "also update the tests for the change we just discussed")
- Use \`explore\` for pure codebase research that doesn't need conversation context
- Use \`planner\` for architectural planning

**Fork usage notes:**
- Fork agents always run asynchronously - you can continue working while they execute
- Fork agents cannot spawn sub-agents (no recursion)
- Fork agents cannot ask the user questions - they work autonomously
- Launch multiple forks in a single message for maximum parallelism
`.trim(),
  // No system prompt - the forked agent should inherit the parent's full context; append additional instructions in the user prompt if needed
  systemPrompt: "",
};
