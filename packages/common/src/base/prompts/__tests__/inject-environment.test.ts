import type { UIMessage } from "ai";
import { expect, test } from "vitest";
import type { Environment } from "../../environment";
import { formatters } from "../../formatters";
import {
  createEnvironmentPrompt,
  injectEnvironment,
  shouldAppendEnvironmentMessage,
} from "../environment";
import { prompts } from "../index";

test("injectEnvironment adds a full environment to multi-message histories without one", () => {
  const messages = [
    createTextMessage("user-1", "user", "legacy question"),
    createTextMessage("assistant-1", "assistant", "legacy answer"),
    createTextMessage("user-2", "user", "follow-up"),
  ];

  const result = injectEnvironment(messages, createTestEnvironment());

  expect(countFullEnvironments(result)).toBe(1);
});

test("injectEnvironment adds a full environment when compaction hides the historical one", () => {
  const fullEnvironment = createEnvironmentPrompt(
    createTestEnvironment(),
    undefined,
  );
  const messages = [
    createTextMessage("user-1", "user", fullEnvironment),
    createTextMessage("assistant-1", "assistant", "old answer"),
    createTextMessage(
      "user-2",
      "user",
      "<compact>Previous conversation summary</compact>",
    ),
    createTextMessage("assistant-2", "assistant", "recent answer"),
    createTextMessage("user-3", "user", "follow-up"),
  ];

  const result = injectEnvironment(messages, createTestEnvironment());
  const modelMessages = formatters.llm(result);

  expect(modelMessages[0]?.id).toBe("user-2");
  expect(countFullEnvironments(modelMessages)).toBe(1);
});

test("injectEnvironment preserves a full environment when regenerating a request", () => {
  const originalEnvironment = createTestEnvironment();
  originalEnvironment.workspace.terminals = [
    {
      name: "Original terminal",
      isActive: true,
      backgroundJobId: "term-original",
    },
  ];
  const originalReminder = `<system-reminder>${createEnvironmentPrompt(
    originalEnvironment,
    undefined,
  )}</system-reminder>`;
  const messages = [
    createTextMessage("user-1", "user", "legacy question"),
    createTextMessage("assistant-1", "assistant", "legacy answer"),
    {
      id: "user-2",
      role: "user" as const,
      parts: [
        { type: "text" as const, text: originalReminder },
        { type: "text" as const, text: "follow-up" },
      ],
    },
  ];
  const reloadedEnvironment = createTestEnvironment();
  reloadedEnvironment.currentTime = "2026-06-24T00:00:00.000Z";
  reloadedEnvironment.workspace.terminals = [
    {
      name: "Reloaded terminal",
      isActive: true,
      backgroundJobId: "term-reloaded",
    },
  ];

  const result = injectEnvironment(messages, reloadedEnvironment);

  expect(countFullEnvironments(result)).toBe(1);
  expect(result[2]?.parts[0]).toEqual({
    type: "text",
    text: originalReminder,
  });
});

test("injectEnvironment appends only the missing environment after a compacted continuation", () => {
  const environment = createTestEnvironment();
  const messages = [
    createTextMessage(
      "user-0",
      "user",
      prompts.createSystemReminder(createEnvironmentPrompt(environment, undefined)),
    ),
    createTextMessage(
      "user-1",
      "user",
      "<compact>Previous conversation summary</compact>",
    ),
    createTextMessage("assistant-1", "assistant", "tool result"),
  ];
  const original = structuredClone(messages);

  expect(shouldAppendEnvironmentMessage(messages)).toBe(true);
  const result = injectEnvironment(messages, environment);
  expect(shouldAppendEnvironmentMessage(result)).toBe(false);
  const modelMessages = formatters.llm(result);

  expect(countFullEnvironments(modelMessages)).toBe(1);
  expect(messages).toEqual(original);
  expect(result.slice(0, -1)).toEqual(original);
  expect(result.at(-1)?.role).toBe("user");
  expect(formatters.ui(result)).toEqual(formatters.ui(original));

  const restored = structuredClone(result);
  injectEnvironment(restored, { ...environment, currentTime: "later" });
  expect(restored).toEqual(result);
  expect(countFullEnvironments(formatters.llm(restored))).toBe(1);
});

test("an appended environment remains stable after persistence", () => {
  const environment = createTestEnvironment();
  const fullReminder = prompts.createSystemReminder(
    createEnvironmentPrompt(environment, undefined),
  );
  const liteReminder = prompts.createSystemReminder(
    "# GIT STATUS\nThis workspace is not managed by git",
  );
  const persisted: UIMessage[] = [
    createTextMessage("user-0", "user", fullReminder),
    createTextMessage("assistant-0", "assistant", "old answer"),
    {
      id: "user-1",
      role: "user",
      parts: [
        {
          type: "text",
          text: "<compact>Previous conversation summary</compact>",
        },
        { type: "text", text: liteReminder },
        { type: "text", text: "follow-up" },
      ],
    },
    createTextMessage("assistant-1", "assistant", "tool result"),
  ];
  const inMemory = structuredClone(persisted);

  const first = injectEnvironment(inMemory, environment);

  // The in-memory chat state must stay identical to what is persisted.
  expect(inMemory).toEqual(persisted);
  expect(first.slice(0, -1)).toEqual(persisted);
  expect(first.at(-1)?.parts).toEqual([{ type: "text", text: fullReminder }]);
  expect(countFullEnvironments(formatters.llm(first))).toBe(1);

  // The transport persists the new last message through chatStreamStarted.
  const saved = structuredClone(first);

  // Later continuations, including after reloading from the store with a
  // changed environment, produce the exact same prefix.
  const laterEnvironment = createTestEnvironment();
  laterEnvironment.currentTime = "2030-01-01T00:00:00.000Z";
  laterEnvironment.workspace.terminals = [
    { name: "New terminal", isActive: true, backgroundJobId: "term-new" },
  ];
  expect(injectEnvironment(first, laterEnvironment)).toBe(first);
  expect(formatters.llm(injectEnvironment(first, laterEnvironment))).toEqual(
    formatters.llm(first),
  );
  expect(
    formatters.llm(injectEnvironment(structuredClone(saved), laterEnvironment)),
  ).toEqual(formatters.llm(first));

  // New user turns retain the same prefix and receive a lite reminder.
  const nextTurn = [
    ...first,
    createTextMessage("user-2", "user", "next question"),
  ];
  injectEnvironment(nextTurn, laterEnvironment);
  expect(getMessageText(nextTurn.at(-1))).not.toContain("# System Information");
  expect(formatters.llm(nextTurn).slice(0, 3)).toEqual(formatters.llm(first));
});

test.each([false, true])(
  "injectEnvironment preserves lite reminders and restores the environment on a new reminder (assistant tail: %s)",
  (continuation) => {
    const environment = createTestEnvironment();
    const messages: UIMessage[] = [
      createTextMessage("user-0", "user", "start"),
    ];
    injectEnvironment(messages, environment);
    messages.push(
      createTextMessage("assistant-0", "assistant", "done"),
      createTextMessage("user-1", "user", "inspect this file"),
    );
    injectEnvironment(messages, environment);
    environment.workspace.activeTabs = [
      { filepath: "current.ts", isActive: true },
    ];
    environment.workspace.terminals = [
      {
        name: "Current terminal",
        isActive: true,
        backgroundJobId: "term-current",
      },
    ];
    environment.workspace.gitStatus = {
      currentBranch: "current",
      mainBranch: "main",
      status: "M current.ts",
      recentCommits: [],
    };
    const agentReminder = prompts.customAgentSystemReminder("demo");
    messages[2].parts.unshift({
      type: "text",
      text: "<compact>Summary</compact>",
    });
    messages[2].parts.push({ type: "text", text: agentReminder });
    messages[2].parts.push({
      type: "text",
      text: prompts.createSystemReminder(
        "# GIT STATUS\nAnother environment reminder",
      ),
    });
    if (continuation)
      messages.push(
        createTextMessage("assistant-1", "assistant", "tool result"),
      );
    const original = structuredClone(messages);

    expect(shouldAppendEnvironmentMessage(messages)).toBe(true);
    const result = injectEnvironment(messages, environment);
    expect(injectEnvironment(result, environment)).toBe(result);

    expect(messages).toEqual(original);
    expect(result.slice(0, -1)).toEqual(original);
    expect(result.at(-1)?.parts).toEqual([
      {
        type: "text",
        text: prompts.createSystemReminder(
          createEnvironmentPrompt(environment, undefined),
        ),
      },
    ]);
    const text = getMessageText(result.at(-1));
    expect(text).toContain("current.ts (active)");
    expect(text).toContain("term-current");
    expect(text).toContain("Current branch: current");
    expect(countFullEnvironments(formatters.llm(result))).toBe(1);
  },
);

test("injectEnvironment preserves assistant-ended history when a full environment remains visible", () => {
  const messages = [
    createTextMessage(
      "user-1",
      "user",
      createEnvironmentPrompt(createTestEnvironment(), undefined),
    ),
    createTextMessage("assistant-1", "assistant", "answer"),
    createTextMessage("user-2", "user", "follow-up"),
    createTextMessage("assistant-2", "assistant", "tool result"),
  ];
  const original = structuredClone(messages);

  expect(shouldAppendEnvironmentMessage(messages)).toBe(false);
  expect(injectEnvironment(messages, createTestEnvironment())).toBe(messages);

  expect(messages).toEqual(original);
});

test("injectEnvironment uses a lite environment and preserves it on retry when full remains visible", () => {
  const messages = [
    createTextMessage(
      "user-1",
      "user",
      createEnvironmentPrompt(createTestEnvironment(), undefined),
    ),
    createTextMessage("assistant-1", "assistant", "answer"),
    createTextMessage("user-2", "user", "follow-up"),
  ];

  const result = injectEnvironment(messages, createTestEnvironment());

  expect(countFullEnvironments(result)).toBe(1);
  expect(getMessageText(result.at(-1))).not.toContain("# System Information");
  expect(getMessageText(result.at(-1))).toContain("# GIT STATUS");

  const original = structuredClone(result);
  const laterEnvironment = createTestEnvironment();
  laterEnvironment.currentTime = "2030-01-01T00:00:00.000Z";
  laterEnvironment.workspace.terminals = [
    { name: "New terminal", isActive: true, backgroundJobId: "term-new" },
  ];
  expect(injectEnvironment(result, laterEnvironment)).toEqual(original);
});

test("injectEnvironment places environment before invocation reminders and the prompt", () => {
  const userPrompt = "/demo use this agent";
  const agentReminder = prompts.customAgentSystemReminder("demo");
  const messages: UIMessage[] = [
    {
      id: "message-1",
      role: "user",
      parts: [
        { type: "text", text: agentReminder },
        { type: "text", text: userPrompt },
      ],
    },
  ];

  injectEnvironment(messages, createTestEnvironment());

  expect(messages[0].parts[0]).toMatchObject({
    type: "text",
    text: expect.stringContaining("# System Information"),
  });
  expect(messages[0].parts[1]).toEqual({ type: "text", text: agentReminder });
  expect(messages[0].parts[2]).toEqual({ type: "text", text: userPrompt });
});

function createTextMessage(
  id: string,
  role: UIMessage["role"],
  text: string,
): UIMessage {
  return {
    id,
    role,
    parts: [{ type: "text", text }],
  };
}

function getMessageText(message: UIMessage | undefined): string {
  return (
    message?.parts
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("\n") ?? ""
  );
}

function countFullEnvironments(messages: UIMessage[]): number {
  return messages.reduce(
    (count, message) =>
      count +
      message.parts.filter(
        (part) =>
          part.type === "text" &&
          part.text.includes("# System Information") &&
          part.text.includes("Operating System: darwin") &&
          part.text.includes("Home Directory: /Users/pochi") &&
          part.text.includes("Current Working Directory: /Users/pochi/project"),
      ).length,
    0,
  );
}

function createTestEnvironment(): Environment {
  return {
    currentTime: "2026-06-23T00:00:00.000Z",
    workspace: {},
    todos: [],
    info: {
      cwd: "/Users/pochi/project",
      os: "darwin",
      homedir: "/Users/pochi",
      shell: "zsh",
    },
  };
}
