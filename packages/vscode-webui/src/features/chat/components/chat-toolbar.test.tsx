import type { BackgroundJobNotification } from "@getpochi/common";
import type {
  BackgroundJobNotificationPart,
  Message,
  PendingInput,
  QueuedUserInput,
  Task,
} from "@getpochi/livekit";
import type { Todo } from "@getpochi/tools";
// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  DraftMessage,
  PendingInputController,
} from "../hooks/use-chat-submit";
import { ChatToolbar } from "./chat-toolbar";
import { QueuedMessages } from "./queued-messages";
const chatSubmitMocks = vi.hoisted(() => {
  const preparing = { current: false };
  const handleSteer = vi.fn();
  const sendPendingInput = vi.fn();
  return {
    preparing,
    handleSteer,
    sendPendingInput,
    useChatSubmit: vi.fn(
      (_props: {
        isTodoMode?: boolean;
        onTodoModeSubmitted?: () => void;
      }) => ({
        isPreparingMessage: preparing.current,
        handleSubmit: vi.fn(),
        handleSteerSubmit: vi.fn(),
        handleSteer,
        sendPendingInput,
        handleStop: vi.fn(),
      }),
    ),
  };
});
const chatInputFormMocks = vi.hoisted(() => ({
  props: undefined as
    | {
        queuedMessages?: {
          parts: unknown[];
          raw: {
            nonRemovable?: boolean;
          };
        }[];
        onSteerQueuedMessages?: () => void;
        onRemoveQueuedMessage?: (index: number) => void;
        onEditQueuedMessage?: (index: number) => void;
        onSelectTodoMode?: () => void;
        allowEditQueuedMessage?: boolean;
      }
    | undefined,
  focusInput: vi.fn(),
}));
const userEditsMocks = vi.hoisted(() => ({
  userEdits: [] as Array<{
    filepath: string;
    diff: string;
    added: number;
    removed: number;
  }>,
}));
const chatInputStateMocks = vi.hoisted(() => ({
  setInput: vi.fn(),
  clearInput: vi.fn(),
}));
const attachmentUploadMocks = vi.hoisted(() => ({
  restoreFiles: vi.fn(),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@/lib/hooks/use-background-commands", () => ({
  useBackgroundCommands: () => ({ backgroundCommands: {}, show: vi.fn() }),
}));
vi.mock("@/lib/hooks/use-visible-terminals", () => ({
  useVisibleTerminals: () => ({
    terminals: [],
    openBackgroundJobTerminal: vi.fn(),
  }),
}));
vi.mock("@/features/tools", async () => {
  const { BackgroundJobPanel } = await import(
    "../../tools/components/command-execution-panel"
  );
  return { BackgroundJobPanel };
});
vi.mock("../../tools/components/xterm", () => ({
  XTerm: () => null,
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
  HoverCard: ({
    children,
  }: {
    children: React.ReactNode;
  }) => <>{children}</>,
  HoverCardContent: ({
    children,
  }: {
    children: React.ReactNode;
  }) => <>{children}</>,
  HoverCardTrigger: ({
    children,
  }: {
    children: React.ReactNode;
  }) => <>{children}</>,
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
    ({
      children,
    }: {
      children: React.ReactNode;
    }) => <div data-testid="todo-list">{children}</div>,
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
  useDefaultStore: () => ({
    commit: vi.fn(),
    storeId: "store-1",
    useQuery: () => [],
  }),
}));
vi.mock("@/lib/vscode", () => ({
  vscodeHost: {},
}));
vi.mock("../hooks/use-chat-input-state", () => ({
  useChatInputState: () => ({
    input: { text: "" },
    setInput: chatInputStateMocks.setInput,
    clearInput: chatInputStateMocks.clearInput,
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
  ChatInputForm: ({
    children,
    ...props
  }: {
    children: React.ReactNode;
  } & Record<string, unknown>) => {
    chatInputFormMocks.props = props;
    // React 19 passes the ref as a prop.
    const ref = props.ref as
      | { current: { focusInput: () => void } | null }
      | undefined;
    if (ref) {
      ref.current = { focusInput: chatInputFormMocks.focusInput };
    }
    return (
      <form>
        {children}
        <QueuedMessages
          messages={(props.queuedMessages as DraftMessage[]) ?? []}
          onRemove={vi.fn()}
        />
      </form>
    );
  },
}));
vi.mock("./error-message-view", () => ({
  ErrorMessageView: () => null,
}));
vi.mock("./background-job-manage-panel", () => ({
  BackgroundJobManagePanel: () => null,
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

interface RenderToolbarOptions {
  messages?: Message[];
  todos?: Todo[];
  pendingNotifications?: BackgroundJobNotificationPart[];
}

/** A fake chat kit owning the pending input, re-rendering the toolbar. */
function createPendingInput(notifications: BackgroundJobNotificationPart[]) {
  let nextId = 0;
  let pending: PendingInput = { userInputs: [], notifications };
  let onChange: (pending: PendingInput) => void = () => {};
  const set = (next: PendingInput) => {
    pending = next;
    onChange(next);
  };
  const controller = {
    get pendingInput() {
      return pending;
    },
    queueUserInput: vi.fn((input: Omit<QueuedUserInput, "id">) => {
      const id = `queued-${nextId++}`;
      set({
        ...pending,
        userInputs: [...pending.userInputs, { ...input, id }],
      });
      return id;
    }),
    removeUserInput: vi.fn((id: string) => {
      const input = pending.userInputs.find((item) => item.id === id);
      if (!input) return undefined;
      set({
        ...pending,
        userInputs: pending.userInputs.filter((item) => item !== input),
      });
      return input;
    }),
    flushPendingInput: vi.fn(() => false),
  } satisfies PendingInputController;
  return {
    controller,
    useMirror() {
      const [mirror, setMirror] = useState(pending);
      onChange = setMirror;
      return mirror;
    },
    /** Queues a message like the composer does while the agent is busy. */
    queue(message: DraftMessage) {
      act(() => {
        controller.queueUserInput({
          parts: message.parts,
          display: { raw: message.raw, draft: message.draft },
        });
      });
    },
    /** Re-renders the toolbar without changing the pending input. */
    rerender() {
      act(() => set({ ...pending }));
    },
  };
}

function renderToolbar(
  isSubTask: boolean,
  lastCheckpointHash?: string,
  {
    messages = [],
    todos = [auditTodo],
    pendingNotifications = [],
  }: RenderToolbarOptions = {},
) {
  const pendingInput = createPendingInput(pendingNotifications);
  function Toolbar() {
    return (
      <ChatToolbar
        chat={
          {
            messages,
            sendMessage: vi.fn(),
            addToolOutput: vi.fn(),
            status: "ready",
          } as never
        }
        approvalAndRetry={
          { pendingApproval: undefined, retry: vi.fn() } as never
        }
        compact={vi.fn()}
        attachmentUpload={
          {
            files: [],
            isUploading: false,
            fileInputRef: { current: null },
            removeFile: vi.fn(),
            restoreFiles: attachmentUploadMocks.restoreFiles,
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
        todos={todos}
        updateTodos={vi.fn()}
        updateTodoCompletion={vi.fn()}
        todoPaused={false}
        onTodoPausedChange={vi.fn()}
        taskId="task-1"
        pendingInput={pendingInput.useMirror()}
        pendingInputController={pendingInput.controller}
        persistToolOutput={vi.fn()}
      />
    );
  }
  render(<Toolbar />);
  return pendingInput;
}
function notificationPart(
  backgroundJobId: string,
): BackgroundJobNotificationPart {
  return {
    type: "data-background-job-notification",
    data: notification(backgroundJobId),
  };
}
function notification(
  backgroundJobId: string,
): Extract<BackgroundJobNotification, { kind: "command" }> {
  return {
    kind: "command",
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
function pendingFollowupQuestionMessages(
  state: "input-available" | "output-available",
): Message[] {
  return [
    {
      id: "message-1",
      role: "assistant",
      parts: [
        { type: "step-start" },
        {
          type: "tool-askFollowupQuestion",
          toolCallId: "call-1",
          state,
          input: { questions: [] },
          ...(state === "output-available"
            ? { output: { success: true } }
            : {}),
        },
      ],
    } as unknown as Message,
  ];
}
describe("ChatToolbar", () => {
  beforeEach(() => {
    chatSubmitMocks.preparing.current = false;
    chatSubmitMocks.useChatSubmit.mockClear();
    chatSubmitMocks.handleSteer.mockClear();
    chatSubmitMocks.sendPendingInput.mockClear();
    chatInputFormMocks.props = undefined;
    chatInputFormMocks.focusInput.mockReset();
    userEditsMocks.userEdits = [];
    chatInputStateMocks.setInput.mockReset();
    attachmentUploadMocks.restoreFiles.mockReset();
  });
  it("provides job display context to pending notifications in the composer", () => {
    const backgroundJobId = "bgjob-cmd-pending";
    const consoleError = vi.spyOn(console, "error");
    try {
      renderToolbar(false, undefined, {
        messages: [
          {
            id: "assistant-1",
            role: "assistant",
            parts: [
              {
                type: "tool-executeCommand",
                toolCallId: "command-1",
                state: "output-available",
                input: { command: "bun run test", cwd: "/workspace" },
                output: {
                  output: "started",
                  _meta: { backgroundJobId },
                },
              },
            ],
          } as Message,
        ],
        pendingNotifications: [
          {
            type: "data-background-job-notification",
            data: {
              ...notification(backgroundJobId),
              command: "fallback command",
              summary: "Completed",
            },
          },
        ],
      });

      expect(screen.getByText("bun run test")).toBeTruthy();
      expect(screen.queryByText("fallback command")).toBeNull();
      expect(consoleError).not.toHaveBeenCalledWith(
        "useBackgroundJobContext must be used within a BackgroundJobContextProvider",
      );
    } finally {
      consoleError.mockRestore();
    }
  });
  it("restores a queued message into the composer when it is edited", async () => {
    const draft = {
      input: { json: null, text: "queued text", pastedTexts: ["pasted"] },
      attachments: [
        {
          type: "file",
          filename: "queued.png",
          mediaType: "image/png",
          url: "https://blob/queued.png",
        },
      ],
    };
    const pendingInput = renderToolbar(false);
    pendingInput.queue({
      parts: [{ type: "text", text: "queued text" }],
      raw: { text: "queued text" },
      draft: draft as DraftMessage["draft"],
    });

    await act(async () => {
      chatInputFormMocks.props?.onEditQueuedMessage?.(0);
    });

    expect(pendingInput.controller.removeUserInput).toHaveBeenCalledWith(
      "queued-0",
    );
    expect(chatInputStateMocks.setInput).toHaveBeenCalledWith(draft.input);
    expect(attachmentUploadMocks.restoreFiles).toHaveBeenCalledWith(
      draft.attachments,
    );
    expect(chatInputFormMocks.props?.queuedMessages).toEqual([]);
  });
  it.each([true, false, undefined])(
    "restores queued Todo mode (%s) for the next submission",
    async (isTodoMode) => {
      const pendingInput = renderToolbar(false, undefined, { todos: [] });
      act(() => chatInputFormMocks.props?.onSelectTodoMode?.());

      if (isTodoMode) {
        // Queuing a Todo message clears the composer mode.
        act(() => {
          chatSubmitMocks.useChatSubmit.mock.lastCall?.[0].onTodoModeSubmitted?.();
        });
        expect(screen.queryByText("chat.todoModeLabel")).toBeNull();
      }

      pendingInput.queue({
        parts: [{ type: "text", text: "queued text" }],
        raw: { text: "queued text", isTodoMode },
        draft: {
          input: { json: null, text: "queued text" },
          attachments: [],
        },
      });
      act(() => chatInputFormMocks.props?.onEditQueuedMessage?.(0));

      expect(chatSubmitMocks.useChatSubmit).toHaveBeenLastCalledWith(
        expect.objectContaining({ isTodoMode: !!isTodoMode }),
      );
      expect(!!screen.queryByText("chat.todoModeLabel")).toBe(!!isTodoMode);
      expect(chatInputFormMocks.props?.queuedMessages).toEqual([]);
    },
  );
  it("does not restore Todo mode while active todos exist", () => {
    const pendingInput = renderToolbar(false);
    pendingInput.queue({
      parts: [{ type: "text", text: "queued text" }],
      raw: { text: "queued text", isTodoMode: true },
      draft: {
        input: { json: null, text: "queued text" },
        attachments: [],
      },
    });
    act(() => chatInputFormMocks.props?.onEditQueuedMessage?.(0));

    expect(chatSubmitMocks.useChatSubmit).toHaveBeenLastCalledWith(
      expect.objectContaining({ isTodoMode: false }),
    );
    expect(screen.queryByText("chat.todoModeLabel")).toBeNull();
  });
  it("blocks editing while a message is being prepared and unlocks afterwards", () => {
    chatSubmitMocks.preparing.current = true;
    const pendingInput = renderToolbar(false);
    const message: DraftMessage = {
      parts: [{ type: "text", text: "queued text" }],
      raw: { text: "queued text" },
      draft: {
        input: { json: null, text: "queued text" },
        attachments: [],
      },
    };
    pendingInput.queue(message);

    expect(chatInputFormMocks.props?.allowEditQueuedMessage).toBe(false);
    act(() => chatInputFormMocks.props?.onEditQueuedMessage?.(0));
    expect(chatInputStateMocks.setInput).not.toHaveBeenCalled();
    expect(attachmentUploadMocks.restoreFiles).not.toHaveBeenCalled();
    expect(chatInputFormMocks.props?.queuedMessages).toEqual([message]);

    chatSubmitMocks.preparing.current = false;
    pendingInput.rerender();
    expect(chatInputFormMocks.props?.allowEditQueuedMessage).toBe(true);
    act(() => chatInputFormMocks.props?.onEditQueuedMessage?.(0));
    expect(chatInputStateMocks.setInput).toHaveBeenCalledWith(
      message.draft?.input,
    );
    expect(chatInputFormMocks.props?.queuedMessages).toEqual([]);
  });
  it("focuses the composer after a queued message is edited", async () => {
    const pendingInput = renderToolbar(false);
    pendingInput.queue({
      parts: [{ type: "text", text: "queued text" }],
      raw: { text: "queued text" },
      draft: {
        input: { json: null, text: "queued text" },
        attachments: [],
      },
    });

    await act(async () => {
      chatInputFormMocks.props?.onEditQueuedMessage?.(0);
      // The focus is deferred by a timeout.
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(chatInputFormMocks.focusInput).toHaveBeenCalled();
  });
  it("renders todos in root task pages", () => {
    renderToolbar(false);
    expect(screen.getByTestId("todo-list")).toBeTruthy();
  });
  it("does not render audit todos in subtask pages", () => {
    renderToolbar(true);
    expect(screen.queryByTestId("todo-list")).toBeNull();
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
  describe("pending input delivery", () => {
    it("asks the chat kit to deliver pending input once idle", async () => {
      await act(async () => {
        renderToolbar(false, undefined, {
          pendingNotifications: [
            {
              type: "data-background-job-notification",
              data: {
                kind: "subagent",
                notificationId: "bgjob-task-" + "child" + ":terminal:1",
                backgroundJobId: "bgjob-task-" + "child",
                taskId: "child",
                title: "Review",
                status: "completed",
                result: "done",
              },
            },
          ],
        });
      });
      // The chat kit decides what may go out, e.g. it holds notifications
      // back while a follow-up question waits for its answer.
      expect(chatSubmitMocks.sendPendingInput).toHaveBeenCalledWith({
        automatic: true,
      });
    });
    it("asks again when a message is queued while idle", async () => {
      const pendingInput = renderToolbar(false, undefined, {
        messages: pendingFollowupQuestionMessages("input-available"),
      });
      chatSubmitMocks.sendPendingInput.mockClear();
      pendingInput.queue({
        parts: [{ type: "text", text: "hello" }],
        raw: { text: "hello" },
      });
      expect(chatSubmitMocks.sendPendingInput).toHaveBeenCalledWith({
        automatic: true,
      });
    });
    it("shows the pending notifications after the queued user messages", async () => {
      const pendingInput = renderToolbar(false, undefined, {
        pendingNotifications: [notificationPart("bgjob-cmd-1")],
      });
      pendingInput.queue({
        parts: [{ type: "text", text: "hello" }],
        raw: { text: "hello" },
      });
      const queuedMessages = chatInputFormMocks.props?.queuedMessages ?? [];
      expect(queuedMessages).toHaveLength(2);
      expect(queuedMessages[0].parts).toEqual([
        { type: "text", text: "hello" },
      ]);
      expect(queuedMessages[1].parts).toEqual([
        notificationPart("bgjob-cmd-1"),
      ]);
      expect(queuedMessages[1].raw.nonRemovable).toBe(true);
    });
    it("removes a queued message through the chat kit", () => {
      const pendingInput = renderToolbar(false, undefined, {
        pendingNotifications: [notificationPart("bgjob-cmd-1")],
      });
      pendingInput.queue({
        parts: [{ type: "text", text: "hello" }],
        raw: { text: "hello" },
      });
      act(() => chatInputFormMocks.props?.onRemoveQueuedMessage?.(0));
      expect(pendingInput.controller.removeUserInput).toHaveBeenCalledWith(
        "queued-0",
      );
      // Notifications cannot be removed.
      act(() => chatInputFormMocks.props?.onRemoveQueuedMessage?.(0));
      expect(pendingInput.controller.removeUserInput).toHaveBeenCalledOnce();
      expect(chatInputFormMocks.props?.queuedMessages).toHaveLength(1);
    });
    it("steers all pending input at once", async () => {
      await act(async () => {
        renderToolbar(false, undefined, {
          pendingNotifications: [notificationPart("bgjob-cmd-1")],
        });
      });
      await act(async () => {
        chatInputFormMocks.props?.onSteerQueuedMessages?.();
      });
      expect(chatSubmitMocks.handleSteer).toHaveBeenCalledOnce();
    });
  });
});
