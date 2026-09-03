import type { BackgroundJobNotification } from "@getpochi/common";
import type { Message, Task } from "@getpochi/livekit";
import type { Todo } from "@getpochi/tools";
// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChatToolbar } from "./chat-toolbar";

const chatSubmitMocks = vi.hoisted(() => {
  const sendQueuedMessage = vi.fn(() => Promise.resolve(true));
  const setQueuedMessages = {
    current: undefined as
      | React.Dispatch<React.SetStateAction<unknown[]>>
      | undefined,
  };
  return {
    sendQueuedMessage,
    setQueuedMessages,
    useChatSubmit: vi.fn((props: { setQueuedMessages: unknown }) => {
      setQueuedMessages.current = props.setQueuedMessages as React.Dispatch<
        React.SetStateAction<unknown[]>
      >;
      return {
        handleSubmit: vi.fn(),
        handleSteerSubmit: vi.fn(),
        handleSteerQueuedMessage: vi.fn(),
        handleStop: vi.fn(),
        sendQueuedMessage,
      };
    }),
  };
});
const backgroundJobMocks = vi.hoisted(() => ({
  notifications: [] as unknown[],
  acknowledge: vi.fn(() => Promise.resolve()),
}));
const userEditsMocks = vi.hoisted(() => ({
  userEdits: [] as Array<{
    filepath: string;
    diff: string;
    added: number;
    removed: number;
  }>,
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
vi.mock("@/lib/hooks/use-background-job-notifications", () => ({
  useBackgroundJobNotifications: () => ({
    notifications: backgroundJobMocks.notifications,
    acknowledge: backgroundJobMocks.acknowledge,
  }),
}));
vi.mock("@/lib/hooks/use-custom-agents", () => ({
  useCustomAgents: () => ({ customAgents: [], isLoading: false }),
}));
vi.mock("@/lib/hooks/use-reviews", () => ({
  useReviews: () => [],
}));
vi.mock("@/lib/hooks/use-skills", () => ({
  useSkills: () => ({ skills: [], isLoading: false }),
}));
vi.mock("@/lib/hooks/use-user-edits", () => ({
  useUserEdits: () => userEditsMocks.userEdits,
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
    isAboutToExecuteWithAutoApprove: false,
    isRunning: false,
    isSubmitEnabled: true,
    isStopEnabled: false,
    allowSendMessage: true,
    allowSteer: true,
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

function renderToolbar(
  isSubTask: boolean,
  lastCheckpointHash?: string,
  deliverBackgroundJobNotificationsRef?: React.RefObject<() => boolean>,
) {
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
        {
          id: "task-1",
          todos: undefined,
          totalTokens: 0,
          lastCheckpointHash,
        } as unknown as Task
      }
      displayError={undefined}
      todos={[auditTodo]}
      updateTodos={vi.fn()}
      updateTodoCompletion={vi.fn()}
      todoPaused={false}
      onTodoPausedChange={vi.fn()}
      taskId="task-1"
      deliverBackgroundJobNotificationsRef={
        deliverBackgroundJobNotificationsRef
      }
    />,
  );
}

function notification(backgroundJobId: string): BackgroundJobNotification {
  return {
    notificationId: `${backgroundJobId}:terminal`,
    backgroundJobId,
    outputFile: `/tmp/${backgroundJobId}.log`,
    command: `run ${backgroundJobId}`,
    status: "completed",
    summary: `Background command "${backgroundJobId}" completed`,
    exitCode: 0,
    finishedAt: 1,
  };
}

describe("ChatToolbar", () => {
  beforeEach(() => {
    chatSubmitMocks.useChatSubmit.mockClear();
    chatSubmitMocks.sendQueuedMessage.mockClear();
    chatSubmitMocks.setQueuedMessages.current = undefined;
    backgroundJobMocks.notifications = [];
    backgroundJobMocks.acknowledge.mockClear();
    userEditsMocks.userEdits = [];
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

  it("submits no user edits after they disappear from the input", () => {
    renderToolbar(false, "checkpoint-1");

    expect(chatSubmitMocks.useChatSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        userEdits: [],
      }),
    );
  });

  it("submits the user edits shown in the input", () => {
    const userEdits = [
      {
        filepath: "src/example.ts",
        diff: "+const value = 1;",
        added: 1,
        removed: 0,
      },
    ];
    userEditsMocks.userEdits = userEdits;

    renderToolbar(false, "checkpoint-1");

    expect(chatSubmitMocks.useChatSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        userEdits,
      }),
    );
  });

  it("passes the accumulated terminal context selections (empty by default) to useChatSubmit", () => {
    renderToolbar(false);

    expect(chatSubmitMocks.useChatSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        terminalContextSelections: [],
        clearTerminalContextSelections: expect.any(Function),
      }),
    );
  });

  describe("background job notification delivery", () => {
    it("sends a queued notification instead of a plain continuation", async () => {
      backgroundJobMocks.notifications = [notification("bgjob-cmd-1")];
      const deliverRef: React.RefObject<() => boolean> = {
        current: () => false,
      };

      renderToolbar(false, undefined, deliverRef);

      let delivered: boolean | undefined;
      await act(async () => {
        delivered = deliverRef.current();
      });

      expect(delivered).toBe(true);
      // The guard is kept so an intentional manual approval mode is not
      // silently turned into auto approve by a notification.
      expect(chatSubmitMocks.sendQueuedMessage).toHaveBeenCalledWith(0, {
        keepAutoApproveGuard: true,
      });
    });

    it("delivers nothing when no notification is queued", async () => {
      const deliverRef: React.RefObject<() => boolean> = {
        current: () => false,
      };

      renderToolbar(false, undefined, deliverRef);

      let delivered: boolean | undefined;
      await act(async () => {
        delivered = deliverRef.current();
      });

      expect(delivered).toBe(false);
      expect(chatSubmitMocks.sendQueuedMessage).not.toHaveBeenCalled();
    });

    it("delivers nothing while a queued user message is ahead of the notification", async () => {
      backgroundJobMocks.notifications = [notification("bgjob-cmd-1")];
      const deliverRef: React.RefObject<() => boolean> = {
        current: () => false,
      };

      renderToolbar(false, undefined, deliverRef);

      await act(async () => {
        chatSubmitMocks.setQueuedMessages.current?.((current) => [
          { parts: [{ type: "text", text: "hello" }], raw: { text: "hello" } },
          ...current,
        ]);
      });

      let delivered: boolean | undefined;
      await act(async () => {
        delivered = deliverRef.current();
      });

      expect(delivered).toBe(false);
      expect(chatSubmitMocks.sendQueuedMessage).not.toHaveBeenCalled();
    });

    it("does not send the same notification twice when the decision is evaluated again", async () => {
      backgroundJobMocks.notifications = [notification("bgjob-cmd-1")];
      const deliverRef: React.RefObject<() => boolean> = {
        current: () => false,
      };

      renderToolbar(false, undefined, deliverRef);

      let second: boolean | undefined;
      await act(async () => {
        deliverRef.current();
        second = deliverRef.current();
      });

      // Still true: the pending delivery starts the next request, so the caller
      // must not start a plain continuation on top of it.
      expect(second).toBe(true);
      expect(chatSubmitMocks.sendQueuedMessage).toHaveBeenCalledOnce();
    });
  });
});
