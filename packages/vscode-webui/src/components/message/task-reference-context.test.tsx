// @vitest-environment jsdom
import { serializeTaskReference } from "@getpochi/common";
import type { Message } from "@getpochi/livekit";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  TaskReferenceContextProvider,
  useMentionedTaskTitle,
} from "./task-reference-context";

const Title = ({ id }: { id: string }) => (
  <span>{useMentionedTaskTitle(id) ?? "none"}</span>
);

const messages = [
  {
    id: "m1",
    role: "user",
    parts: [
      {
        type: "text",
        text: `compare ${serializeTaskReference({ id: "t1", path: "/p/t1.md", title: "Fix login bug" })}`,
      },
    ],
  },
] as Message[];

describe("TaskReferenceContextProvider", () => {
  it("resolves titles recorded in user messages", () => {
    const { container } = render(
      <TaskReferenceContextProvider messages={messages}>
        <Title id="t1" />
        <Title id="t2" />
      </TaskReferenceContextProvider>,
    );
    expect(container.textContent).toBe("Fix login bugnone");
  });
});
