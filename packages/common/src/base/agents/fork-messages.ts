/**
 * Utilities for building fork agent messages.
 *
 * A fork agent inherits the parent conversation's full message history
 * so it can understand the ongoing context. The fork directive is appended
 * as a final user message.
 */

interface ForkMessage {
  id: string;
  role: "user" | "assistant" | "system";
  parts: Array<{ type: string; [key: string]: unknown }>;
}

/**
 * Build the fork directive prompt that is appended to the parent's messages.
 */
export function buildForkDirective(directive: string): string {
  return `<fork-directive>
You are a forked agent spawned from the parent conversation above. You have full context of the ongoing work.

## Behavioral Rules

1. **Execute directly.** Do NOT spawn sub-agents or new tasks. You have all the tools you need.
2. **No user interaction.** Do NOT use askFollowupQuestion. Work autonomously with the information available.
3. **Stay focused.** Complete ONLY the specific task described below. Do not address other issues you may notice.
4. **Be concise.** When done, call attemptCompletion with a structured report.

## Report Format

When calling attemptCompletion, structure your result as:

Scope: [1 sentence describing what you were asked to do]
Result: [1-2 sentences on outcome - success, partial, or blocked]
Key files: [bullet list of files read or modified, with brief notes]
Files changed: [bullet list of files you wrote to, or "None"]
Issues: [any blockers, warnings, or follow-ups for the parent, or "None"]

## Your Task

${directive}
</fork-directive>`;
}

/**
 * Build the initial message array for a fork agent.
 *
 * The fork agent inherits the parent's full conversation history
 * to maximize context understanding (and enable prompt cache reuse
 * when supported by the provider).
 *
 * Structure:
 *   [parent message 1, ..., parent message N, fork directive user message]
 */
export function buildForkMessages<T extends ForkMessage>(
  parentMessages: T[],
  directive: string,
): ForkMessage[] {
  // Deep clone to avoid mutating parent state, and rewrite message ids because
  // forked subtasks live in the same store as the parent.
  const messages: ForkMessage[] = structuredClone(parentMessages).map(
    (message) => ({
      ...message,
      id: crypto.randomUUID(),
    }),
  );

  // Append fork directive as a new user message
  messages.push({
    id: crypto.randomUUID(),
    role: "user",
    parts: [
      {
        type: "text",
        text: buildForkDirective(directive),
      },
    ],
  });

  return messages;
}

/**
 * Detect whether the current conversation is inside a fork child.
 * Used to prevent recursive forking.
 */
export function isInForkChild<T extends ForkMessage>(messages: T[]): boolean {
  return messages.some((m) =>
    m.parts.some(
      (p) =>
        p.type === "text" &&
        typeof p.text === "string" &&
        p.text.includes("<fork-directive>"),
    ),
  );
}
