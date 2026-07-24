// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { QueuedMessage } from "../hooks/use-chat-submit";
import { QueuedMessages } from "./queued-messages";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: { count?: number }) =>
      values?.count === undefined ? key : `${key}:${values.count}`,
  }),
}));

describe("QueuedMessages", () => {
  it("uses the todo icon for queued todo-mode messages", () => {
    const { container } = render(
      <QueuedMessages
        messages={[
          queuedMessage({ text: "regular queued message" }),
          queuedMessage({ text: "todo queued message", isTodoMode: true }),
        ]}
        onRemove={vi.fn()}
      />,
    );

    expect(container.querySelectorAll(".lucide-list-end")).toHaveLength(1);
    expect(container.querySelectorAll(".lucide-target")).toHaveLength(1);
  });
});

function queuedMessage({
  text,
  isTodoMode = false,
}: {
  text: string;
  isTodoMode?: boolean;
}): QueuedMessage {
  return {
    text,
    files: [],
    reviews: [],
    userEdits: [],
    isTodoMode,
  };
}
