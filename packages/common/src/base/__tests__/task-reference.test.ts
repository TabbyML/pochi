import type { UIMessage } from "ai";
import { describe, expect, it } from "vitest";
import { parseTitle } from "../../message-utils";
import { formatters } from "../formatters";
import {
  parseTaskReferences,
  serializeTaskReference,
} from "../task-reference";

const ref = {
  id: "task-1",
  path: "/home/u/.pochi/projects/p/transcripts/task-1.md",
  title: "Fix login bug",
};

function userMessage(text: string): UIMessage {
  return {
    id: "m1",
    role: "user",
    parts: [{ type: "text", text }],
  };
}

function textsOf(message: UIMessage) {
  return message.parts.flatMap((p) => (p.type === "text" ? [p.text] : []));
}

describe("task reference serialization", () => {
  it("round-trips id, path and title", () => {
    const text = `see ${serializeTaskReference(ref)} please`;
    expect(parseTaskReferences(text)).toEqual([ref]);
  });

  it("escapes special characters in title and path", () => {
    const tricky = {
      id: "task-2",
      path: '/tmp/a"b&c.md',
      title: 'Use <b> & "quotes" > tags',
    };
    const serialized = serializeTaskReference(tricky);
    expect(serialized).toContain(
      'title="Use &lt;b&gt; &amp; &quot;quotes&quot; &gt; tags"',
    );
    expect(parseTaskReferences(serialized)).toEqual([tricky]);
  });

  it("collapses whitespace in the title and falls back when empty", () => {
    expect(
      parseTaskReferences(
        serializeTaskReference({ ...ref, title: "a\n  b\tc" }),
      )[0].title,
    ).toBe("a b c");
    expect(
      parseTaskReferences(serializeTaskReference({ ...ref, title: "  " }))[0]
        .title,
    ).toBe("Untitled task");
  });

  it("uses the path as the tag body", () => {
    expect(serializeTaskReference(ref)).toMatch(
      new RegExp(`>${ref.path}</task>$`),
    );
  });

  it("ignores unrelated tags", () => {
    expect(parseTaskReferences("<tasks>x</tasks> <file>a.ts</file>")).toEqual(
      [],
    );
  });
});

describe("task reference in titles", () => {
  it("renders the tag as the task title", () => {
    expect(parseTitle(`Continue ${serializeTaskReference(ref)}`)).toBe(
      "Continue Fix login bug",
    );
  });
});

describe("formatters.llm with task references", () => {
  it("keeps only the path inline and explains it in a reminder before it", () => {
    const tag = serializeTaskReference(ref);
    const [message] = formatters.llm([
      userMessage(`compare with ${tag} now`),
    ]);
    const texts = textsOf(message);
    expect(texts).toHaveLength(2);
    expect(texts[0]).toContain("<system-reminder>");
    expect(texts[0]).toContain(
      `- Task title: Fix login bug\n  Conversation path: ${ref.path}`,
    );
    expect(texts[0]).toContain("only when it helps");
    expect(texts[1]).toBe(`compare with ${ref.path} now`);
    expect(texts[1]).not.toContain("Fix login bug");
    expect(texts[1]).not.toContain("<task");
  });

  it("places the reminder after earlier system reminders", () => {
    const [message] = formatters.llm([
      {
        id: "m1",
        role: "user",
        parts: [
          { type: "text", text: "<system-reminder>env</system-reminder>" },
          { type: "text", text: serializeTaskReference(ref) },
        ],
      },
    ]);
    const texts = textsOf(message);
    expect(texts).toHaveLength(3);
    expect(texts[0]).toBe("<system-reminder>env</system-reminder>");
    expect(texts[1]).toContain(ref.path);
    expect(texts[2]).toBe(ref.path);
  });

  it("de-duplicates repeated references", () => {
    const tag = serializeTaskReference(ref);
    const [message] = formatters.llm([userMessage(`${tag} and again ${tag}`)]);
    const reminder = textsOf(message)[0];
    expect(reminder.split(ref.path)).toHaveLength(2);
  });

  it("lists multiple distinct references", () => {
    const other = { ...ref, id: "task-3", path: "/x/task-3.md", title: "B" };
    const [message] = formatters.llm([
      userMessage(
        `${serializeTaskReference(ref)} ${serializeTaskReference(other)}`,
      ),
    ]);
    const reminder = textsOf(message)[0];
    expect(reminder).toContain(ref.path);
    expect(reminder).toContain("/x/task-3.md");
  });

  it("adds nothing when there is no task tag", () => {
    const [message] = formatters.llm([userMessage("plain <tasks>x</tasks>")]);
    expect(textsOf(message)).toEqual(["plain <tasks>x</tasks>"]);
  });

  it("does not expand tags inside assistant messages", () => {
    const tag = serializeTaskReference(ref);
    const [message] = formatters.llm([
      { id: "a1", role: "assistant", parts: [{ type: "text", text: tag }] },
    ]);
    expect(textsOf(message)).toHaveLength(1);
  });

  it("does not mutate the input messages", () => {
    const input = [userMessage(serializeTaskReference(ref))];
    const snapshot = JSON.stringify(input);
    formatters.llm(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});
