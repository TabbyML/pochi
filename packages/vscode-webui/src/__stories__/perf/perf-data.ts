import type { Message, UITools } from "@getpochi/livekit";
import type { ToolUIPart } from "ai";

export function makeAddedFilePatch(filePath: string, lineCount: number) {
  const lines = makeMarkdownPlanLines(lineCount).map((line) => `+${line}`);

  return [
    `diff --git a/${filePath} b/${filePath}`,
    "new file mode 100644",
    "index 0000000..1111111",
    "--- /dev/null",
    `+++ b/${filePath}`,
    `@@ -0,0 +1,${lineCount} @@`,
    ...lines,
    "",
  ].join("\n");
}

export function makeReplaceFilePatch(filePath: string, lineCount: number) {
  const removed = makeMarkdownPlanLines(lineCount, "Before").map(
    (line) => `-${line}`,
  );
  const added = makeMarkdownPlanLines(lineCount, "After").map(
    (line) => `+${line}`,
  );

  return [
    `diff --git a/${filePath} b/${filePath}`,
    "index 1111111..2222222 100644",
    `--- a/${filePath}`,
    `+++ b/${filePath}`,
    `@@ -1,${lineCount} +1,${lineCount} @@`,
    ...removed,
    ...added,
    "",
  ].join("\n");
}

export function makeFileMatches(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    file: `packages/example/src/generated/file-${String(index).padStart(5, "0")}.tsx`,
    line: index + 1,
    context: `match context for generated file ${index + 1}`,
  }));
}

export function makeWriteToFileTool(lineCount: number): ToolUIPart<UITools> {
  const content = makeMarkdownPlanLines(lineCount).join("\n");

  return {
    type: "tool-writeToFile",
    toolCallId: `perf-write-to-file-${lineCount}`,
    state: "output-available",
    input: {
      path: "docs/plan.md",
      content,
    },
    output: {
      success: true,
      _meta: {
        edit: makeAddedFilePatch("docs/plan.md", lineCount),
        editSummary: {
          added: lineCount,
          removed: 0,
        },
      },
    },
  } as ToolUIPart<UITools>;
}

function makeMarkdownPlanLines(lineCount: number, phase = "Current") {
  const templates = [
    (n: number) => `# ${phase} implementation plan ${n}`,
    () => "",
    (n: number) =>
      `The goal is to validate **rendering cost**, _layout stability_, and \`diff parsing\` for section ${n}.`,
    (n: number) =>
      `- [ ] Measure mount latency for \`DiffViewer\` with ${n} generated markdown lines.`,
    () =>
      "- [ ] Compare long task count, DOM node delta, and worst frame duration.",
    (n: number) =>
      `> Note: section ${n} intentionally mixes prose, lists, tables, and fenced code.`,
    () => "| Area | Signal | Expected impact |",
    () => "| --- | --- | --- |",
    (n: number) =>
      `| Diff | \`PatchDiff\` render ${n} | Lower initial DOM pressure |`,
    (n: number) =>
      `| MessageList | content visibility ${n} | Less offscreen layout work |`,
    () => "```ts",
    (n: number) =>
      `const metric${n} = { mountMs: ${n}, longTasks: ${n % 7}, ok: true };`,
    (n: number) =>
      `reportMetric("section-${n}", metric${n}.mountMs, metric${n}.longTasks);`,
    () => "```",
    (n: number) =>
      `1. Open the story with \`lineCount=${n}\` and clear previous samples.`,
    () =>
      "2. Trigger **Remount Both** and compare the optimized variant against the plain path.",
    (n: number) =>
      `3. Capture the result in \`docs/perf-notes-${String(n).padStart(5, "0")}.md\`.`,
    () => "```json",
    (n: number) => `{"section":${n},"variant":"${phase}","status":"sample"}`,
    () => "```",
    () => "---",
    (n: number) =>
      `Final observation ${n}: prefer data that survives repeated runs over a single lucky sample.`,
  ];

  return Array.from({ length: lineCount }, (_, index) => {
    const n = index + 1;
    return templates[index % templates.length](n);
  });
}

export function makePerfMessages({
  count,
  diffEvery = 25,
  diffLineCount = 500,
}: {
  count: number;
  diffEvery?: number;
  diffLineCount?: number;
}): Message[] {
  return Array.from({ length: count }, (_, index) => {
    const isUser = index % 2 === 0;
    const parts: Message["parts"] = [
      {
        type: "text",
        text: isUser
          ? `Please update the implementation plan for item ${index + 1}.`
          : [
              `Here is the status for item ${index + 1}.`,
              "",
              "- Reviewed existing files",
              "- Applied focused edits",
              "- Verified the relevant paths",
              "",
              "```ts",
              `const item = ${index + 1};`,
              "```",
            ].join("\n"),
        state: "done",
      },
    ];

    if (!isUser && diffEvery > 0 && index % diffEvery === 1) {
      parts.push({
        type: "tool-writeToFile",
        toolCallId: `perf-message-write-${index}`,
        state: "output-available",
        input: {
          path: `docs/generated-plan-${index}.md`,
          content: "",
        },
        output: {
          success: true,
          _meta: {
            edit: makeAddedFilePatch(
              `docs/generated-plan-${index}.md`,
              diffLineCount,
            ),
            editSummary: {
              added: diffLineCount,
              removed: 0,
            },
          },
        },
      } as Message["parts"][number]);
    }

    if (isUser) {
      return {
        id: `perf-message-${index}`,
        role: "user",
        metadata: {
          kind: "user",
        },
        parts,
      } satisfies Message;
    }

    return {
      id: `perf-message-${index}`,
      role: "assistant",
      metadata: {
        kind: "assistant",
        totalTokens: 0,
        finishReason: "stop",
      },
      parts,
    } satisfies Message;
  });
}

interface TaskHistoryShape {
  assistantPartsPerMessage: number;
  partTextLength: number;
}

export function makeTaskHistoryMessages({
  messageCount,
  assistantPartsPerMessage,
  partTextLength,
}: TaskHistoryShape & { messageCount: number }): Message[] {
  return Array.from({ length: messageCount }, (_, index) =>
    makeTaskHistoryMessage({
      id: `task-history-message-${index}`,
      role: index % 2 === 0 ? "user" : "assistant",
      sequence: index,
      assistantPartsPerMessage,
      partTextLength,
    }),
  );
}

export function appendTaskHistoryTurn(
  messages: Message[],
  {
    turnIndex,
    assistantPartsPerMessage,
    partTextLength,
  }: TaskHistoryShape & { turnIndex: number },
): Message[] {
  return [
    ...messages,
    makeTaskHistoryMessage({
      id: `task-history-turn-${turnIndex}-user`,
      role: "user",
      sequence: turnIndex * 2,
      assistantPartsPerMessage,
      partTextLength,
    }),
    makeTaskHistoryMessage({
      id: `task-history-turn-${turnIndex}-assistant`,
      role: "assistant",
      sequence: turnIndex * 2 + 1,
      assistantPartsPerMessage,
      partTextLength,
    }),
  ];
}

export function updateTaskHistoryStream(
  messages: Message[],
  {
    updateIndex,
    chunkSize,
    snapshot = structuredClone,
  }: {
    updateIndex: number;
    chunkSize: number;
    snapshot?: (message: Message) => Message;
  },
): Message[] {
  const messageIndex = messages.length - 1;
  const message = messages[messageIndex];
  if (message?.role !== "assistant") return messages;

  const textPartIndex = message.parts.findLastIndex(
    (part) => part.type === "text",
  );
  if (textPartIndex === -1) return messages;

  const parts = message.parts.map((part, partIndex) => {
    if (partIndex !== textPartIndex || part.type !== "text") return part;
    return {
      ...part,
      text:
        part.text + makeSizedText(` stream update ${updateIndex}`, chunkSize),
      state: "streaming" as const,
    };
  });

  const nextMessage = snapshot({ ...message, parts });
  return [
    ...messages.slice(0, messageIndex),
    nextMessage,
    ...messages.slice(messageIndex + 1),
  ];
}

export function summarizeTaskHistory(messages: Message[]) {
  return {
    messageCount: messages.length,
    partCount: messages.reduce(
      (partCount, message) => partCount + message.parts.length,
      0,
    ),
    serializedBytes: new TextEncoder().encode(JSON.stringify(messages))
      .byteLength,
  };
}

export function summarizeMessageRange(messages: Message[], startIndex: number) {
  const start = Math.min(Math.max(startIndex, 0), messages.length);
  return {
    inputMessageCount: messages.length,
    inputPartCount: messages.reduce(
      (partCount, message) => partCount + message.parts.length,
      0,
    ),
    mountedMessageCount: messages.length - start,
    mountedPartCount: messages
      .slice(start)
      .reduce((partCount, message) => partCount + message.parts.length, 0),
  };
}

function makeTaskHistoryMessage({
  id,
  role,
  sequence,
  assistantPartsPerMessage,
  partTextLength,
}: TaskHistoryShape & {
  id: string;
  role: "user" | "assistant";
  sequence: number;
}): Message {
  const parts =
    role === "user"
      ? [makeTaskHistoryTextPart(role, sequence, 0, partTextLength)]
      : Array.from({ length: assistantPartsPerMessage }, (_, partIndex) =>
          makeTaskHistoryAssistantPart({
            sequence,
            partIndex,
            partCount: assistantPartsPerMessage,
            partTextLength,
          }),
        );

  if (role === "user") {
    return {
      id,
      role,
      metadata: { kind: "user" },
      parts,
    } satisfies Message;
  }

  return {
    id,
    role,
    metadata: {
      kind: "assistant",
      totalTokens: 0,
      finishReason: "stop",
    },
    parts,
  } satisfies Message;
}

function makeTaskHistoryAssistantPart({
  sequence,
  partIndex,
  partCount,
  partTextLength,
}: {
  sequence: number;
  partIndex: number;
  partCount: number;
  partTextLength: number;
}): Message["parts"][number] {
  if (
    partIndex === partCount - 1 ||
    partIndex % 10 === 2 ||
    partIndex % 10 === 9
  ) {
    return makeTaskHistoryTextPart(
      "assistant",
      sequence,
      partIndex,
      partTextLength,
    );
  }

  const toolCallId = `task-history-tool-${sequence}-${partIndex}`;
  const filePath = `packages/example/src/task-history-${sequence}-${partIndex}.ts`;

  switch (partIndex % 10) {
    case 0:
    case 4:
      return {
        type: "reasoning",
        text: makeSizedText(
          `Reasoning for message ${sequence}, part ${partIndex}.`,
          partTextLength,
        ),
      };
    case 1:
      return {
        type: "tool-readFile",
        toolCallId,
        state: "output-available",
        input: { path: filePath },
        output: {
          content: makeSizedText(`Read ${filePath}.`, partTextLength),
          isTruncated: false,
          filePath,
        },
      } as Message["parts"][number];
    case 3:
      return {
        type: "tool-executeCommand",
        toolCallId,
        state: "output-available",
        input: {
          command: `printf 'task history ${sequence}-${partIndex}'`,
        },
        output: {
          output: makeSizedText(
            `Completed command ${sequence}-${partIndex}.`,
            partTextLength,
          ),
          isTruncated: false,
        },
      } as Message["parts"][number];
    case 5:
      return {
        type: "tool-searchFiles",
        toolCallId,
        state: "output-available",
        input: { path: "packages", regex: `task-history-${sequence}` },
        output: {
          matches: [
            {
              file: filePath,
              line: partIndex + 1,
              context: makeSizedText(
                `Search match ${sequence}-${partIndex}.`,
                partTextLength,
              ),
            },
          ],
          isTruncated: false,
        },
      } as Message["parts"][number];
    case 6:
      return {
        type: "tool-listFiles",
        toolCallId,
        state: "output-available",
        input: { path: "packages/example/src", recursive: false },
        output: { files: [filePath], isTruncated: false },
      } as Message["parts"][number];
    case 7:
      return {
        type: "tool-globFiles",
        toolCallId,
        state: "output-available",
        input: { path: "packages/example/src", globPattern: "**/*.ts" },
        output: { files: [filePath], isTruncated: false },
      } as Message["parts"][number];
    case 8:
      return {
        type: "tool-writeToFile",
        toolCallId,
        state: "output-available",
        input: {
          path: filePath,
          content: makeSizedText(
            `export const taskHistory${sequence} = ${partIndex};`,
            partTextLength,
          ),
        },
        output: { success: true },
      } as Message["parts"][number];
    default:
      return makeTaskHistoryTextPart(
        "assistant",
        sequence,
        partIndex,
        partTextLength,
      );
  }
}

function makeTaskHistoryTextPart(
  role: "user" | "assistant",
  sequence: number,
  partIndex: number,
  partTextLength: number,
): Message["parts"][number] {
  return {
    type: "text",
    text: makeSizedText(
      `${role} message ${sequence}, part ${partIndex}.`,
      partTextLength,
    ),
    state: "done",
  };
}

function makeSizedText(prefix: string, length: number) {
  if (prefix.length >= length) return prefix.slice(0, length);
  return prefix + "x".repeat(length - prefix.length);
}
