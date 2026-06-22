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
        startedAt: new Date(),
        finishedAt: new Date(),
      },
      parts,
    } satisfies Message;
  });
}
