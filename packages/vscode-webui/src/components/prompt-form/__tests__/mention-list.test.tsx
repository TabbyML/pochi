import { render, screen, waitFor } from "@testing-library/react";
import type { Editor } from "@tiptap/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { MentionList } from "../context-mention/mention-list";

vi.mock("@/features/tools", () => ({ FileIcon: () => null }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const files = Array.from({ length: 20 }, (_, i) => ({
  filepath: `file-${i}.ts`,
  isDir: false,
}));
const tasks = Array.from({ length: 6 }, (_, i) => ({
  taskId: `task-${i}`,
  title: `Task ${i}`,
  updatedAt: 0,
  filePath: `/t/${i}.md`,
}));

function renderList(query?: string) {
  render(
    <MentionList
      items={[]}
      command={vi.fn()}
      editor={{} as Editor}
      range={{ from: 0, to: 1 }}
      query={query}
      fetchItems={async () => files}
      fetchTasks={async () => tasks}
    />,
  );
}

describe("MentionList", () => {
  beforeAll(() => {
    // jsdom does not implement scrollIntoView
    Element.prototype.scrollIntoView = vi.fn();
  });

  it("shows a few entries of each group when nothing is typed", async () => {
    renderList("");
    await waitFor(() => screen.getByText("mentionList.tasks"));
    expect(screen.getByText("mentionList.files")).toBeTruthy();
    expect(screen.getAllByText(/^file-\d+\.ts$/)).toHaveLength(5);
    expect(screen.getAllByText(/^Task \d$/)).toHaveLength(3);
  });

  it("shows all matches once a query is typed", async () => {
    renderList("f");
    await waitFor(() => screen.getByText("mentionList.tasks"));
    expect(screen.getAllByText(/^file-\d+\.ts$/)).toHaveLength(20);
    expect(screen.getAllByText(/^Task \d$/)).toHaveLength(6);
  });
});
