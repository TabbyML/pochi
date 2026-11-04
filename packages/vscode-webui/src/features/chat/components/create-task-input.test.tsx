// @vitest-environment jsdom
import { useAttachmentUpload } from "@/lib/hooks/use-attachment-upload";
import { UploadError } from "@/lib/remote-blob-store";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { forwardRef, useImperativeHandle } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CreateTaskInput } from "./create-task-input";

const fileToUri = vi.hoisted(() => vi.fn());
const vscodeHost = vi.hoisted(() => ({
  openTaskInPanel: vi.fn(),
  createWorktree: vi.fn(),
  persistPastedTextFiles: vi.fn(),
  showWarningMessage: vi.fn(),
}));

vi.mock("@getpochi/livekit", () => ({ fileToUri }));
vi.mock("@/lib/remote-blob-store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/remote-blob-store")>()),
  blobStore: {},
}));
vi.mock("@/lib/vscode", () => ({ vscodeHost }));
vi.mock("@/features/settings", () => ({
  useIsDevMode: () => [false],
  useSettingsStore: { persist: { rehydrate: vi.fn() } },
  useSelectedModels: () => ({
    groupedModels: [],
    selectedModel: { id: "model" },
    selectedModelFromStore: undefined,
    isLoading: false,
    isFetching: false,
    reload: vi.fn(),
    updateSelectedModelId: vi.fn(),
  }),
}));
vi.mock("@/lib/hooks/use-active-selection", () => ({
  useActiveSelection: () => undefined,
}));
vi.mock("@/lib/hooks/use-skills", () => ({
  useSkills: () => ({ skills: [], isLoading: false }),
}));
vi.mock("@/lib/hooks/use-custom-agents", () => ({
  useCustomAgents: () => ({ customAgents: [], isLoading: false }),
}));
vi.mock("@/lib/hooks/use-mcp-config-override", () => ({
  useMcpConfigOverride: () => ({
    globalMcpConfig: {},
    mcpConfigOverride: {},
    toggleServer: vi.fn(),
    reset: vi.fn(),
  }),
}));
vi.mock("@/lib/hooks/use-task-input-draft", () => ({
  useTaskInputDraft: () => ({
    draft: { json: null, text: "describe this image" },
    setDraft: vi.fn(),
    clearDraft: vi.fn(),
  }),
}));
vi.mock("@/lib/hooks/use-worktrees", () => ({
  useWorktrees: () => ({ worktrees: [], isLoading: false }),
}));
vi.mock("@/components/attachment-preview-list", () => ({
  AttachmentPreviewList: () => null,
}));
vi.mock("@/components/model-select", () => ({ ModelSelect: () => null }));
vi.mock("@/components/worktree-select", () => ({ WorktreeSelect: () => null }));
vi.mock("@/components/prompt-form/todo-mode-badge", () => ({
  TodoModeBadge: () => null,
}));
vi.mock("@/components/submit-dropdown-button", () => ({
  SubmitDropdownButton: (props: {
    isLoading: boolean;
    disabled: boolean;
    onSubmit: () => void;
  }) => (
    <button
      type="button"
      aria-label="submit"
      aria-busy={props.isLoading}
      disabled={props.disabled}
      onClick={props.onSubmit}
    />
  ),
}));
vi.mock("./chat-input-form", () => ({
  ChatInputForm: forwardRef<unknown, { editable: boolean }>((props, ref) => {
    useImperativeHandle(ref, () => ({
      addToSubmitHistory: vi.fn(),
      getInputSnapshot: () => undefined,
      focusInput: vi.fn(),
    }));
    return <div data-testid="input" data-editable={props.editable} />;
  }),
}));

function Harness() {
  const attachmentUpload = useAttachmentUpload();
  return (
    <>
      <button
        type="button"
        aria-label="attach"
        onClick={() =>
          attachmentUpload.handleFileDrop([
            new File(["image"], "image.png", { type: "image/png" }),
          ])
        }
      />
      <CreateTaskInput
        cwd="/workspace"
        workspacePath="/workspace"
        attachmentUpload={attachmentUpload}
        userSelectedWorktree={undefined}
        setUserSelectedWorktree={vi.fn()}
        deletingWorktreePaths={new Set()}
      />
    </>
  );
}

describe("CreateTaskInput", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    fileToUri.mockReset();
    vscodeHost.openTaskInPanel.mockReset();
  });

  it("unfreezes the input and shows the error when the upload hits 429", async () => {
    fileToUri.mockRejectedValueOnce(
      new UploadError("Upload failed (HTTP 429)", 429),
    );
    render(<Harness />);

    fireEvent.click(screen.getByLabelText("attach"));
    await act(async () => {
      fireEvent.click(screen.getByLabelText("submit"));
    });
    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    expect(vscodeHost.openTaskInPanel).not.toHaveBeenCalled();
    expect(screen.getByLabelText("submit").getAttribute("aria-busy")).toBe(
      "false",
    );
    expect(screen.getByTestId("input").getAttribute("data-editable")).toBe(
      "true",
    );
    expect(
      screen.getByText("Too many uploads. Please wait a moment and try again."),
    ).toBeTruthy();

    // The attachment is kept so the user can retry.
    fileToUri.mockResolvedValueOnce("https://blob/uploaded");
    await act(async () => {
      fireEvent.click(screen.getByLabelText("submit"));
    });
    expect(vscodeHost.openTaskInPanel).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: "describe this image",
        files: [
          {
            contentType: "image/png",
            name: "image.png",
            url: "https://blob/uploaded",
          },
        ],
      }),
      { preview: false },
    );
  });
});
