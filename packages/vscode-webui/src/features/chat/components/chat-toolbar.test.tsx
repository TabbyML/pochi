import type { Message, Task } from "@getpochi/livekit";
import type { Todo } from "@getpochi/tools";
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChatToolbar } from "./chat-toolbar";

const chatSubmitMocks = vi.hoisted(() => ({
  useChatSubmit: vi.fn(() => ({
    handleSubmit: vi.fn(),
    handleSteerSubmit: vi.fn(),
    handleStop: vi.fn(),
  })),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/components/attachment-preview-list", () => ({
  AttachmentPreviewList: () => null,
}));
vi.mock("@/components/dev-mode-button", () => ({
  DevModeButton: () => null,
}));
vi.mock("@/components/diff-summary", () => ({
  DiffSummary: () => null,
}));
vi.mock("@/components/model-select", () => ({
  ModelSelect: () => null,
}));
vi.mock("@/components/public-share-button", () => ({
  PublicShareButton: () => null,
}));
vi.mock("@/components/token-usage", () => ({
  TokenUsage: () => null,
}));
vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: React.ComponentProps<"button">) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}));
vi.mock("@/components/ui/hover-card", () => ({
  HoverCard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  HoverCardContent: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  HoverCardTrigger: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));
vi.mock("@/components/ui/skeleton", () => ({
  Skeleton: () => null,
}));

vi.mock("@/features/approval", () => ({
  ApprovalButton: () => null,
  FixWidgetButton: () => null,
  isRetryApprovalCountingDown: () => false,
}));
vi.mock("@/features/chat", () => ({
  useAutoApproveGuard: () => ({ current: "stop" }),
  useToolCallLifeCycle: () => ({ completeToolCalls: [] }),
}));
vi.mock("@/features/settings", () => ({
  AutoApproveMenu: () => null,
  useAutoApprove: () => ({ autoApproveActive: false }),
  useIsDevMode: () => [false, vi.fn()],
  useSelectedModels: () => ({
    groupedModels: [],
    selectedModel: { id: "model-1" },
    selectedModelFromStore: undefined,
    isLoading: false,
    isFetching: false,
    reload: vi.fn(),
    updateSelectedModelId: vi.fn(),
  }),
}));
vi.mock("@/features/todo", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/todo")>();
  const TodoList = Object.assign(
    ({ children }: { children: React.ReactNode }) => (
      <div data-testid="todo-list">{children}</div>
    ),
    {
      Header: () => null,
      Items: () => null,
    },
  );
  return {
    ...actual,
    TodoList,
  };
});
vi.mock("@/lib/hooks/use-add-complete-tool-calls", () => ({
  useAddCompleteToolCalls: () => undefined,
}));
vi.mock("@/lib/hooks/use-reviews", () => ({
  useReviews: () => [],
}));
vi.mock("@/lib/hooks/use-user-edits", () => ({
  useUserEdits: () => [],
}));
vi.mock("@/lib/hooks/use-task-changed-files", () => ({
  useTaskChangedFiles: () => ({
    visibleChangedFiles: [],
  }),
}));
vi.mock("@/lib/use-default-store", () => ({
  useDefaultStore: () => ({ commit: vi.fn() }),
}));
vi.mock("@/lib/vscode", () => ({
  vscodeHost: {},
}));
vi.mock("../hooks/use-chat-input-state", () => ({
  useChatInputState: () => ({
    input: { text: "" },
    setInput: vi.fn(),
    clearInput: vi.fn(),
  }),
}));
vi.mock("../hooks/use-chat-status", () => ({
  useChatStatus: () => ({
    isExecuting: false,
    isBusyCore: false,
    isSubmitDisabled: false,
    showStopButton: false,
  }),
}));
vi.mock("../hooks/use-chat-submit", () => ({
  useChatSubmit: chatSubmitMocks.useChatSubmit,
}));
vi.mock("../hooks/use-inline-compact-task", () => ({
  useInlineCompactTask: () => ({
    inlineCompactTask: vi.fn(),
    inlineCompactTaskPending: false,
  }),
}));
vi.mock("../hooks/use-new-compact-task", () => ({
  useNewCompactTask: () => ({
    newCompactTask: vi.fn(),
    newCompactTaskPending: false,
  }),
}));
vi.mock("../hooks/use-subtask-completed", () => ({
  useShowCompleteSubtaskButton: () => false,
}));
vi.mock("./chat-input-form", () => ({
  ChatInputForm: ({ children }: { children: React.ReactNode }) => (
    <form>{children}</form>
  ),
}));
vi.mock("./error-message-view", () => ({
  ErrorMessageView: () => null,
}));
vi.mock("./submit-review-button", () => ({
  SubmitReviewsButton: () => null,
}));
vi.mock("./subtask", () => ({
  CompleteSubtaskButton: () => null,
}));

const auditTodo: Todo = {
  id: "todo-1",
  content: "Audit this todo",
  status: "in-progress",
  priority: "medium",
};

function renderToolbar(isSubTask: boolean) {
  render(
    <ChatToolbar
      chat={
        {
          messages: [] as Message[],
          sendMessage: vi.fn(),
          addToolOutput: vi.fn(),
          status: "ready",
        } as never
      }
      approvalAndRetry={{ pendingApproval: undefined, retry: vi.fn() } as never}
      compact={vi.fn()}
      attachmentUpload={
        {
          files: [],
          isUploading: false,
          fileInputRef: { current: null },
          removeFile: vi.fn(),
          handleFileSelect: vi.fn(),
          handlePaste: vi.fn(),
          handleFileDrop: vi.fn(),
        } as never
      }
      isSubTask={isSubTask}
      task={
        { id: "task-1", todos: undefined, totalTokens: 0 } as unknown as Task
      }
      displayError={undefined}
      todos={[auditTodo]}
      updateTodos={vi.fn()}
      updateTodoCompletion={vi.fn()}
      todoPaused={false}
      onTodoPausedChange={vi.fn()}
      taskId="task-1"
    />,
  );
}

describe("ChatToolbar", () => {
  beforeEach(() => {
    chatSubmitMocks.useChatSubmit.mockClear();
  });

  it("renders todos in root task pages", () => {
    renderToolbar(false);

    expect(screen.getByTestId("todo-list")).toBeTruthy();
  });

  it("does not render audit todos in subtask pages", () => {
    renderToolbar(true);

    expect(screen.queryByTestId("todo-list")).toBeNull();
  });

  it("disables todo creation while active todos exist", () => {
    renderToolbar(false);

    expect(chatSubmitMocks.useChatSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        canCreateTodo: false,
      }),
    );
  });
});
