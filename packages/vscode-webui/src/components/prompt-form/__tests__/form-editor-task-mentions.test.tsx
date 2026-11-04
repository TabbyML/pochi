import { fuzzySearchTasks } from "@/lib/fuzzy-search";
import { vscodeHost } from "@/lib/vscode";
import type { AutoMemoryTranscriptEntry } from "@getpochi/common";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { Editor } from "@tiptap/react";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { FormEditor } from "../form-editor";

vi.mock("@/features/tools", () => ({ FileIcon: () => null }));
vi.mock("@/features/settings", () => ({
  useSelectedModels: () => ({ models: [], updateSelectedModelId: vi.fn() }),
}));
vi.mock("@/lib/hooks/use-active-tabs", () => ({ useActiveTabs: () => [] }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@/lib/fuzzy-search", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/fuzzy-search")>();
  return { ...actual, fuzzySearchTasks: vi.fn(actual.fuzzySearchTasks) };
});
vi.mock("@/lib/vscode", () => ({
  vscodeHost: {
    listReferenceableTasks: vi.fn(),
    listFilesInWorkspace: vi.fn(async () => [
      { filepath: "foo.ts", isDir: false },
    ]),
    queryGithubIssues: vi.fn(async () => []),
    getSessionState: vi.fn(async () => ({})),
    setSessionState: vi.fn(async () => {}),
  },
}));

const oldTask: AutoMemoryTranscriptEntry & { title: string } = {
  taskId: "old",
  title: "Fix old bug",
  updatedAt: 1,
  filePath: "/transcripts/old.md",
};
const newTask = { ...oldTask, taskId: "new", title: "Fix new bug" };

function deferredTasks() {
  let resolve!: (tasks: AutoMemoryTranscriptEntry[]) => void;
  const promise = new Promise<AutoMemoryTranscriptEntry[]>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function renderEditor(currentTaskId?: string) {
  const editorRef = { current: null as Editor | null };
  const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault());
  render(
    <FormEditor
      input={{
        text: "",
        json: { type: "doc", content: [{ type: "paragraph" }] },
      }}
      setInput={vi.fn()}
      onSubmit={onSubmit}
      onCtrlSubmit={vi.fn()}
      isLoading={false}
      isSubTask={false}
      currentTaskId={currentTaskId}
      editorRef={editorRef}
      autoFocus={false}
      enableSubmitHistory={false}
    />,
  );
  const editor = editorRef.current;
  if (!editor) {
    throw new Error("FormEditor did not expose its editor");
  }
  return { editor, onSubmit };
}

async function typeMention(editor: Editor, text = "@") {
  await act(async () => {
    editor.commands.focus("end");
    await new Promise(requestAnimationFrame);
    editor.commands.insertContent(text);
  });
}

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Range.prototype.getBoundingClientRect = () => new DOMRect();
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(vscodeHost.listReferenceableTasks).mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("FormEditor task mentions", () => {
  it("lets Enter select a ready file while tasks are still loading", async () => {
    const pending = deferredTasks();
    vi.mocked(vscodeHost.listReferenceableTasks).mockReturnValue(
      pending.promise,
    );
    const { editor, onSubmit } = renderEditor("current");
    await typeMention(editor, "@foo");
    await waitFor(() => expect(screen.getByTitle("foo.ts")).toBeTruthy());

    fireEvent.keyDown(editor.view.dom, { key: "Enter", code: "Enter" });

    expect(onSubmit).not.toHaveBeenCalled();
    expect(editor.getJSON().content?.[0].content?.[0].type).toBe("fileMention");
    await act(async () => pending.resolve([]));
  });

  it("does not reopen a dismissed popup when tasks finish loading", async () => {
    const pending = deferredTasks();
    vi.mocked(vscodeHost.listReferenceableTasks).mockReturnValue(
      pending.promise,
    );
    const { editor } = renderEditor("current");
    await typeMention(editor, "@foo");
    // Files are ready independently of the deliberately pending task scan.
    await act(async () => new Promise((resolve) => setTimeout(resolve, 20)));
    fireEvent.keyDown(editor.view.dom, { key: "Escape", code: "Escape" });
    await act(async () => pending.resolve([oldTask]));

    expect(screen.queryByTitle("foo.ts")).toBeNull();
    expect(screen.queryByText(oldTask.title)).toBeNull();
  });

  it("updates an open popup after an expired listing finishes refreshing", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1000);
    vi.mocked(vscodeHost.listReferenceableTasks).mockResolvedValue([oldTask]);
    const { editor } = renderEditor("current");
    await typeMention(editor);
    await waitFor(() => expect(screen.getByText(oldTask.title)).toBeTruthy());
    await act(async () => {
      editor.commands.clearContent();
    });

    now.mockReturnValue(62000);
    const pending = deferredTasks();
    vi.mocked(vscodeHost.listReferenceableTasks).mockReturnValue(
      pending.promise,
    );
    await typeMention(editor);
    await waitFor(() =>
      expect(vscodeHost.listReferenceableTasks).toHaveBeenCalledTimes(2),
    );
    await act(async () => pending.resolve([oldTask, newTask]));

    await waitFor(() => expect(screen.getByText(newTask.title)).toBeTruthy());
  });

  it("searches task titles once per query when the listing is cached", async () => {
    vi.mocked(vscodeHost.listReferenceableTasks).mockResolvedValue([oldTask]);
    const { editor } = renderEditor("current");
    await typeMention(editor);
    await waitFor(() => expect(screen.getByText(oldTask.title)).toBeTruthy());
    vi.mocked(fuzzySearchTasks).mockClear();
    await typeMention(editor, "f");
    await waitFor(() => expect(fuzzySearchTasks).toHaveBeenCalled());

    expect(
      vi.mocked(fuzzySearchTasks).mock.calls.filter(([query]) => query === "f"),
    ).toHaveLength(1);
    expect(vscodeHost.listReferenceableTasks).toHaveBeenCalledTimes(1);
  });

  it("keeps cached tasks if a refresh fails and retries the next query", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1000);
    vi.mocked(vscodeHost.listReferenceableTasks).mockResolvedValue([oldTask]);
    const { editor } = renderEditor("current");
    await typeMention(editor);
    await waitFor(() => expect(screen.getByText(oldTask.title)).toBeTruthy());
    await act(async () => {
      editor.commands.clearContent();
    });

    now.mockReturnValue(62000);
    vi.mocked(vscodeHost.listReferenceableTasks).mockRejectedValue(
      new Error("host unavailable"),
    );
    await typeMention(editor);
    await waitFor(() => expect(screen.getByText(oldTask.title)).toBeTruthy());

    vi.mocked(vscodeHost.listReferenceableTasks).mockResolvedValue([newTask]);
    await typeMention(editor, "f");
    await waitFor(() => expect(screen.getByText(newTask.title)).toBeTruthy());
  });

  it("does not warm a placeholder editor without a current task", async () => {
    const { editor } = renderEditor();
    await act(async () => {
      editor.view.dom.focus();
    });

    expect(vscodeHost.listReferenceableTasks).not.toHaveBeenCalled();
  });

  it("warms a real editor and shares the pending scan with its popup", async () => {
    const pending = deferredTasks();
    vi.mocked(vscodeHost.listReferenceableTasks).mockReturnValue(
      pending.promise,
    );
    const { editor } = renderEditor("current");
    await act(async () => {
      editor.view.dom.focus();
    });
    expect(vscodeHost.listReferenceableTasks).toHaveBeenCalledWith("current");
    await typeMention(editor);
    await act(async () => pending.resolve([oldTask]));
    await waitFor(() => expect(screen.getByText(oldTask.title)).toBeTruthy());

    expect(vscodeHost.listReferenceableTasks).toHaveBeenCalledTimes(1);
  });
});
