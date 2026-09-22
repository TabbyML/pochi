import type { BackgroundJobNotification } from "@getpochi/common";
import type {
  BackgroundJobNotificationPart,
  Message,
  Task,
} from "@getpochi/livekit";
import type { Todo } from "@getpochi/tools";
// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChatToolbar } from "./chat-toolbar";
const chatSubmitMocks = vi.hoisted(() => {
  const preparing = { current: false };
  const handleSteerQueuedMessage = vi.fn();
  const handleSteerBackgroundJobNotifications = vi.fn();
  const setQueuedMessages = {
    current: undefined as
      | React.Dispatch<React.SetStateAction<unknown[]>>
      | undefined,
  };
  return {
    preparing,
    handleSteerQueuedMessage,
    handleSteerBackgroundJobNotifications,
    setQueuedMessages,
    useChatSubmit: vi.fn(
      (props: {
        setQueuedMessages: unknown;
        isTodoMode?: boolean;
        onTodoModeSubmitted?: () => void;
        onBeforeSendText?: (text: string) => void;
      }) => {
        setQueuedMessages.current = props.setQueuedMessages as React.Dispatch<
          React.SetStateAction<unknown[]>
        >;
        return {
          isPreparingMessage: preparing.current,
          handleSubmit: vi.fn(),
          handleSteerSubmit: vi.fn(),
          handleSteerQueuedMessage,
          handleSteerBackgroundJobNotifications,
          handleStop: vi.fn(),
        };
      },
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
        onSteerQueuedMessage?: (index: number) => void;
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
    return <form>{children}</form>;
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
  flushBackgroundJobNotifications?: () => boolean;
  pendingBackgroundJobNotifications?: BackgroundJobNotificationPart[];
}
function renderToolbar(
  isSubTask: boolean,
  lastCheckpointHash?: string,
  {
    messages = [],
    todos = [auditTodo],
    flushBackgroundJobNotifications,
    pendingBackgroundJobNotifications,
  }: RenderToolbarOptions = {},
) {
  render(
    <ChatToolbar
      chat={
        {
          messages,
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
      flushBackgroundJobNotifications={flushBackgroundJobNotifications}
      pendingBackgroundJobNotifications={pendingBackgroundJobNotifications}
      persistToolOutput={vi.fn()}
    />,
  );
}
function notificationPart(
  backgroundJobId: string,
): BackgroundJobNotificationPart {
  return {
    type: "data-background-job-notification",
    data: notification(backgroundJobId),
  };
}
function notification(backgroundJobId: string): BackgroundJobNotification {
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
    chatSubmitMocks.handleSteerQueuedMessage.mockClear();
    chatSubmitMocks.handleSteerBackgroundJobNotifications.mockClear();
    chatSubmitMocks.setQueuedMessages.current = undefined;
    chatInputFormMocks.props = undefined;
    chatInputFormMocks.focusInput.mockReset();
    userEditsMocks.userEdits = [];
    chatInputStateMocks.setInput.mockReset();
    attachmentUploadMocks.restoreFiles.mockReset();
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
    await act(async () => {
      renderToolbar(false);
    });
    await act(async () => {
      chatSubmitMocks.setQueuedMessages.current?.(() => [
        {
          parts: [{ type: "text", text: "queued text" }],
          raw: { text: "queued text" },
          draft,
        },
      ]);
    });

    await act(async () => {
      chatInputFormMocks.props?.onEditQueuedMessage?.(0);
    });

    expect(chatInputStateMocks.setInput).toHaveBeenCalledWith(draft.input);
    expect(attachmentUploadMocks.restoreFiles).toHaveBeenCalledWith(
      draft.attachments,
    );
    expect(chatInputFormMocks.props?.queuedMessages).toEqual([]);
  });
  it.each([true, false, undefined])(
    "restores queued Todo mode (%s) for the next submission",
    async (isTodoMode) => {
      renderToolbar(false, undefined, { todos: [] });
      act(() => chatInputFormMocks.props?.onSelectTodoMode?.());

      if (isTodoMode) {
        // Queuing a Todo message clears the composer mode.
        act(() => {
          chatSubmitMocks.useChatSubmit.mock.lastCall?.[0].onTodoModeSubmitted?.();
        });
        expect(screen.queryByText("chat.todoModeLabel")).toBeNull();
      }

      act(() => {
        chatSubmitMocks.setQueuedMessages.current?.(() => [
          {
            parts: [{ type: "text", text: "queued text" }],
            raw: { text: "queued text", isTodoMode },
            draft: {
              input: { json: null, text: "queued text" },
              attachments: [],
            },
          },
        ]);
      });
      act(() => chatInputFormMocks.props?.onEditQueuedMessage?.(0));

      expect(chatSubmitMocks.useChatSubmit).toHaveBeenLastCalledWith(
        expect.objectContaining({ isTodoMode: !!isTodoMode }),
      );
      expect(!!screen.queryByText("chat.todoModeLabel")).toBe(!!isTodoMode);
      expect(chatInputFormMocks.props?.queuedMessages).toEqual([]);
    },
  );
  it("does not clear a new Todo selection when an older message is sent", () => {
    renderToolbar(false, undefined, { todos: [] });
    const beforeSend =
      chatSubmitMocks.useChatSubmit.mock.lastCall?.[0].onBeforeSendText;
    act(() => chatInputFormMocks.props?.onSelectTodoMode?.());
    expect(screen.queryByText("chat.todoModeLabel")).toBeTruthy();

    act(() => beforeSend?.("older message"));

    expect(screen.queryByText("chat.todoModeLabel")).toBeTruthy();
  });
  it("does not restore Todo mode while active todos exist", () => {
    renderToolbar(false);
    act(() => {
      chatSubmitMocks.setQueuedMessages.current?.(() => [
        {
          parts: [{ type: "text", text: "queued text" }],
          raw: { text: "queued text", isTodoMode: true },
          draft: {
            input: { json: null, text: "queued text" },
            attachments: [],
          },
        },
      ]);
    });
    act(() => chatInputFormMocks.props?.onEditQueuedMessage?.(0));

    expect(chatSubmitMocks.useChatSubmit).toHaveBeenLastCalledWith(
      expect.objectContaining({ isTodoMode: false, canCreateTodo: false }),
    );
    expect(screen.queryByText("chat.todoModeLabel")).toBeNull();
  });
  it("blocks editing while a message is being prepared and unlocks afterwards", () => {
    chatSubmitMocks.preparing.current = true;
    renderToolbar(false);
    const message = {
      parts: [{ type: "text", text: "queued text" }],
      raw: { text: "queued text" },
      draft: {
        input: { json: null, text: "queued text" },
        attachments: [],
      },
    };
    act(() => chatSubmitMocks.setQueuedMessages.current?.(() => [message]));

    expect(chatInputFormMocks.props?.allowEditQueuedMessage).toBe(false);
    act(() => chatInputFormMocks.props?.onEditQueuedMessage?.(0));
    expect(chatInputStateMocks.setInput).not.toHaveBeenCalled();
    expect(attachmentUploadMocks.restoreFiles).not.toHaveBeenCalled();
    expect(chatInputFormMocks.props?.queuedMessages).toEqual([message]);

    chatSubmitMocks.preparing.current = false;
    act(() => chatSubmitMocks.setQueuedMessages.current?.(() => [message]));
    expect(chatInputFormMocks.props?.allowEditQueuedMessage).toBe(true);
    act(() => chatInputFormMocks.props?.onEditQueuedMessage?.(0));
    expect(chatInputStateMocks.setInput).toHaveBeenCalledWith(
      message.draft.input,
    );
    expect(chatInputFormMocks.props?.queuedMessages).toEqual([]);
  });
  it("focuses the composer after a queued message is edited", async () => {
    await act(async () => {
      renderToolbar(false);
    });
    await act(async () => {
      chatSubmitMocks.setQueuedMessages.current?.(() => [
        {
          parts: [{ type: "text", text: "queued text" }],
          raw: { text: "queued text" },
          draft: {
            input: { json: null, text: "queued text" },
            attachments: [],
          },
        },
      ]);
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
    it("delivers subagent results through the notification flush", async () => {
      const flushBackgroundJobNotifications = vi.fn(() => true);
      await act(async () => {
        renderToolbar(false, undefined, {
          flushBackgroundJobNotifications,
          pendingBackgroundJobNotifications: [
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
      expect(flushBackgroundJobNotifications).toHaveBeenCalled();
      expect(chatSubmitMocks.handleSteerQueuedMessage).not.toHaveBeenCalled();
    });
    it("asks the chat kit to deliver a pending notification once idle", async () => {
      const flushBackgroundJobNotifications = vi.fn(() => true);
      await act(async () => {
        renderToolbar(false, undefined, {
          flushBackgroundJobNotifications,
          pendingBackgroundJobNotifications: [notificationPart("bgjob-cmd-1")],
        });
      });
      expect(flushBackgroundJobNotifications).toHaveBeenCalled();
      // Notifications are never sent as a steered user message: the kit
      // decides when they may take a turn of their own.
      expect(chatSubmitMocks.handleSteerQueuedMessage).not.toHaveBeenCalled();
    });
    it("leaves a follow-up question to the chat kit", async () => {
      const flushBackgroundJobNotifications = vi.fn(() => false);
      await act(async () => {
        renderToolbar(false, undefined, {
          messages: pendingFollowupQuestionMessages("input-available"),
          flushBackgroundJobNotifications,
          pendingBackgroundJobNotifications: [notificationPart("bgjob-cmd-1")],
        });
      });
      expect(chatSubmitMocks.handleSteerQueuedMessage).not.toHaveBeenCalled();
    });
    it("auto dequeues a queued user message ahead of the notification", async () => {
      const flushBackgroundJobNotifications = vi.fn(() => true);
      await act(async () => {
        renderToolbar(false, undefined, {
          flushBackgroundJobNotifications,
          pendingBackgroundJobNotifications: [notificationPart("bgjob-cmd-1")],
        });
      });
      flushBackgroundJobNotifications.mockClear();
      await act(async () => {
        chatSubmitMocks.setQueuedMessages.current?.((current) => [
          { parts: [{ type: "text", text: "hello" }], raw: { text: "hello" } },
          ...current,
        ]);
      });
      expect(chatSubmitMocks.handleSteerQueuedMessage).toHaveBeenCalledWith(0);
      expect(flushBackgroundJobNotifications).not.toHaveBeenCalled();
    });
    it("shows the pending notifications after the queued user messages", async () => {
      await act(async () => {
        renderToolbar(false, undefined, {
          flushBackgroundJobNotifications: () => false,
          pendingBackgroundJobNotifications: [notificationPart("bgjob-cmd-1")],
        });
      });
      await act(async () => {
        chatSubmitMocks.setQueuedMessages.current?.((current) => [
          { parts: [{ type: "text", text: "hello" }], raw: { text: "hello" } },
          ...current,
        ]);
      });
      const queuedMessages = chatInputFormMocks.props?.queuedMessages ?? [];
      expect(queuedMessages).toHaveLength(2);
      expect(queuedMessages[1].parts).toEqual([
        notificationPart("bgjob-cmd-1"),
      ]);
      expect(queuedMessages[1].raw.nonRemovable).toBe(true);
    });
    it("steers the notification entry through the chat kit", async () => {
      await act(async () => {
        renderToolbar(false, undefined, {
          flushBackgroundJobNotifications: () => false,
          pendingBackgroundJobNotifications: [notificationPart("bgjob-cmd-1")],
        });
      });
      await act(async () => {
        chatInputFormMocks.props?.onSteerQueuedMessage?.(0);
      });
      expect(
        chatSubmitMocks.handleSteerBackgroundJobNotifications,
      ).toHaveBeenCalled();
      expect(chatSubmitMocks.handleSteerQueuedMessage).not.toHaveBeenCalled();
    });
  });
});
