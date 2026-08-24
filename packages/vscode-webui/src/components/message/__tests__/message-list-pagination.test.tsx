import type { Message } from "@getpochi/livekit";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { Profiler, type ReactNode, useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MessageListPaginationConfig } from "../use-message-list-pagination";

const vscodeMock = vi.hoisted(() => ({ isVSCodeEnvironment: false }));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options?.count === undefined ? key : `${key}:${options.count}`,
  }),
}));

vi.mock("@/lib/vscode", () => ({
  isVSCodeEnvironment: () => vscodeMock.isVSCodeEnvironment,
  vscodeHost: {
    getGlobalState: vi.fn(async () => undefined),
    setGlobalState: vi.fn(async () => undefined),
  },
}));

vi.mock("../../checkpoint-ui", () => ({
  CheckpointUI: () => <div data-testid="checkpoint" />,
  CompactCheckpointUI: () => <div data-testid="compact-checkpoint" />,
}));

vi.mock("@/lib/hooks/use-latest-checkpoint", () => ({
  useLatestCheckpoint: () => null,
}));

vi.mock("@/features/chat", () => ({
  BackgroundJobContextProvider: ({
    children,
  }: {
    children: React.ReactNode;
  }) => <>{children}</>,
  useAutoApproveGuard: () => ({ current: "manual" }),
  useToolCallLifeCycle: () => ({
    executingToolCalls: [],
    completeToolCalls: [],
    isExecuting: false,
  }),
}));

vi.mock("@/features/tools", () => ({
  ToolInvocationPart: (props: {
    tool: { toolCallId: string };
    changes?: { origin?: string; modified?: string };
    messages?: Message[];
    isLastPart?: boolean;
    isInLatestAssistantMessage?: boolean;
  }) => (
    <div
      data-testid="tool-part"
      data-tool-call-id={props.tool.toolCallId}
      data-has-changes={String("changes" in props)}
      data-has-messages={String("messages" in props)}
      data-changes-origin={props.changes?.origin ?? ""}
      data-changes-modified={props.changes?.modified ?? ""}
      data-is-last-part={String(!!props.isLastPart)}
      data-is-in-latest-assistant-message={String(
        !!props.isInLatestAssistantMessage,
      )}
    />
  ),
  BackgroundJobPanel: () => null,
}));

vi.mock("../markdown", () => ({
  MessageMarkdown: ({ children }: { children: string }) => (
    <div data-testid="markdown">{children}</div>
  ),
}));

vi.mock("../user-edits", () => ({
  UserEditsPart: ({
    checkpoints,
  }: {
    checkpoints?: { origin?: string; modified?: string };
  }) => (
    <div
      data-testid="user-edits"
      data-origin={checkpoints?.origin ?? ""}
      data-modified={checkpoints?.modified ?? ""}
    />
  ),
}));

// Import after installing mocks.
const { MessageList } = await import("../message-list");

class IntersectionObserverProbe implements IntersectionObserver {
  static instances: IntersectionObserverProbe[] = [];

  readonly root: Element | Document | null;
  readonly rootMargin: string;
  readonly thresholds = [0];

  constructor(
    private readonly callback: IntersectionObserverCallback,
    options?: IntersectionObserverInit,
  ) {
    this.root = options?.root ?? null;
    this.rootMargin = options?.rootMargin ?? "0px";
    IntersectionObserverProbe.instances.push(this);
  }

  disconnect = vi.fn();
  observe = vi.fn();
  takeRecords = vi.fn(() => []);
  unobserve = vi.fn();

  intersect(isIntersecting = true) {
    this.callback([{ isIntersecting } as IntersectionObserverEntry], this);
  }
}

beforeEach(() => {
  IntersectionObserverProbe.instances = [];
  vscodeMock.isVSCodeEnvironment = false;
  vi.stubGlobal("IntersectionObserver", IntersectionObserverProbe);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const PartsPerMessage = 5;
const InitialMessages =
  MessageListPaginationConfig.partBudget / PartsPerMessage; // 60 / 5 = 12

function makeMessage(index: number): Message {
  const role = index % 2 === 0 ? "user" : "assistant";
  if (role === "user") {
    return {
      id: `m-${index}`,
      role,
      metadata: { kind: "user" },
      parts: Array.from({ length: PartsPerMessage }, (_, i) => ({
        type: "text" as const,
        text: `user ${index} part ${i}`,
      })),
    } as Message;
  }

  return {
    id: `m-${index}`,
    role,
    metadata: { kind: "assistant", totalTokens: 0, finishReason: "stop" },
    parts: [
      { type: "text", text: `assistant ${index} intro` },
      {
        type: "tool-readFile",
        toolCallId: `call-${index}`,
        state: "output-available",
        input: { path: `file-${index}.ts` },
        output: { content: "ok" },
      },
      { type: "data-checkpoint", data: { commit: `commit-${index}` } },
      { type: "text", text: `assistant ${index} outro` },
      { type: "text", text: `assistant ${index} tail` },
    ],
  } as unknown as Message;
}

function makeMessages(count: number) {
  return Array.from({ length: count }, (_, index) => makeMessage(index));
}

function mountedMessageIds(container: HTMLElement) {
  return Array.from(
    container.querySelectorAll<HTMLElement>('[aria-label^="chat-message-"]'),
  ).map((node) => node.querySelector("[data-testid]")?.textContent ?? "");
}

function mountedCount(container: HTMLElement) {
  return container.querySelectorAll('[aria-label^="chat-message-"]').length;
}

function setViewportScrollTop(container: HTMLElement, scrollTop: number) {
  const viewport = container.querySelector<HTMLElement>(
    '[data-slot="scroll-area-viewport"]',
  );
  if (!viewport) throw new Error("Expected MessageList viewport");
  Object.defineProperties(viewport, {
    scrollHeight: { configurable: true, value: 1000 },
    clientHeight: { configurable: true, value: 400 },
    scrollTop: { configurable: true, value: scrollTop, writable: true },
  });
  return viewport;
}

function MessageListProbe({
  messages,
  renderAllMessages = false,
  formatMessages,
  emptyPlaceholder,
}: {
  messages: Message[];
  renderAllMessages?: boolean;
  formatMessages?: (messages: Message[]) => Message[];
  emptyPlaceholder?: ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  return (
    <MessageList
      messages={messages}
      isLoading={false}
      showLoader={false}
      renderAllMessages={renderAllMessages}
      containerRef={containerRef}
      formatMessages={formatMessages}
      emptyPlaceholder={emptyPlaceholder}
    />
  );
}

function renderList(messages: Message[], renderAllMessages = false) {
  return render(
    <MessageListProbe
      messages={messages}
      renderAllMessages={renderAllMessages}
    />,
  );
}

describe("MessageList pagination", () => {
  it("formats only the raw tail page", () => {
    const messages = makeMessages(200);
    const formatMessages = vi.fn((visible: Message[]) => visible);

    render(
      <MessageListProbe messages={messages} formatMessages={formatMessages} />,
    );

    expect(formatMessages).toHaveBeenCalledTimes(1);
    expect(formatMessages).toHaveBeenCalledWith(
      messages.slice(-InitialMessages),
    );
  });

  it("shows the empty placeholder when the full raw history is filtered out", () => {
    const messages = [
      {
        id: "system-reminder",
        role: "user",
        parts: [
          {
            type: "text",
            text: "<system-reminder>Reminder</system-reminder>",
          },
        ],
      } as Message,
    ];

    render(
      <MessageListProbe
        messages={messages}
        formatMessages={() => []}
        emptyPlaceholder={<div data-testid="empty-placeholder" />}
      />,
    );

    expect(screen.getByTestId("empty-placeholder")).toBeTruthy();
  });

  it("looks up user-edit checkpoints by message id after formatting", () => {
    const messages: Message[] = [
      {
        id: "checkpoint-1",
        role: "assistant",
        parts: [{ type: "data-checkpoint", data: { commit: "commit-1" } }],
      } as Message,
      {
        id: "checkpoint-2",
        role: "assistant",
        parts: [{ type: "data-checkpoint", data: { commit: "commit-2" } }],
      } as Message,
      {
        id: "user-edits",
        role: "user",
        parts: [{ type: "data-user-edits", data: { userEdits: [] } }],
      } as unknown as Message,
    ];

    render(
      <MessageListProbe
        messages={messages}
        renderAllMessages
        formatMessages={(visible) => visible.slice(1)}
      />,
    );

    const userEdits = screen.getByTestId("user-edits");
    expect(userEdits.dataset.origin).toBe("commit-1");
    expect(userEdits.dataset.modified).toBe("commit-2");
  });

  it("does not treat the first formatted user message as the start of history", () => {
    vscodeMock.isVSCodeEnvironment = true;
    const messages = makeMessages(14);
    messages[2] = {
      ...messages[2],
      role: "user",
      parts: [
        ...messages[2].parts.slice(0, -1),
        { type: "data-checkpoint", data: { commit: "commit-1" } },
      ],
    } as Message;

    const { container } = render(<MessageListProbe messages={messages} />);

    const firstMessage = container.querySelector(".message-list-item");
    expect(
      firstMessage?.querySelector('[data-testid="checkpoint"]'),
    ).toBeNull();
  });

  it("mounts only the tail page and always keeps the last message", () => {
    const messages = makeMessages(200);
    const { container } = renderList(messages);

    expect(mountedCount(container)).toBe(InitialMessages);
    // The tail must remain mounted.
    expect(mountedMessageIds(container).at(-1)).toContain("assistant 199");
    // The first message must remain unmounted.
    expect(container.textContent).not.toContain("user 0 part 0");
  });

  it("mounts the whole history when renderAllMessages is set", () => {
    const messages = makeMessages(40);
    const { container } = renderList(messages, true);

    expect(mountedCount(container)).toBe(40);
  });

  it("mounts the whole history when it fits in the budget", () => {
    const messages = makeMessages(8);
    const { container } = renderList(messages);

    expect(mountedCount(container)).toBe(8);
    expect(screen.queryByTestId("message-list-auto-load-earlier")).toBeNull();
  });

  it("loads earlier messages when the top trigger enters view", () => {
    const messages = makeMessages(200);
    const { container } = renderList(messages);

    const autoLoadTrigger = screen.getByTestId(
      "message-list-auto-load-earlier",
    );
    expect(autoLoadTrigger.textContent).toBe("");
    expect(autoLoadTrigger.querySelector("button")).toBeNull();
    expect(IntersectionObserverProbe.instances).toHaveLength(1);
    expect(IntersectionObserverProbe.instances[0]?.rootMargin).toBe("0px");

    act(() => IntersectionObserverProbe.instances.at(-1)?.intersect());

    expect(mountedCount(container)).toBeGreaterThan(InitialMessages);
    expect(mountedMessageIds(container).at(-1)).toContain("assistant 199");
  });

  it("mounts the whole history when no scroll container is available", () => {
    const { container } = render(
      <MessageList
        messages={makeMessages(200)}
        isLoading={false}
        showLoader={false}
      />,
    );

    expect(mountedCount(container)).toBe(200);
    expect(IntersectionObserverProbe.instances).toHaveLength(0);
  });

  it("mounts the whole history when IntersectionObserver is unavailable", () => {
    vi.stubGlobal("IntersectionObserver", undefined);

    const { container } = renderList(makeMessages(200));

    expect(mountedCount(container)).toBe(200);
  });

  it("keeps the range start frozen while the last message streams", () => {
    const messages = makeMessages(200);
    const { container, rerender } = renderList(messages);
    const firstMountedBefore = mountedMessageIds(container)[0];

    const last = messages[messages.length - 1];
    const streamed: Message[] = [
      ...messages.slice(0, -1),
      {
        ...last,
        parts: [...last.parts, { type: "text", text: "streamed delta" }],
      } as Message,
    ];
    rerender(<MessageListProbe messages={streamed} />);

    expect(mountedMessageIds(container)[0]).toBe(firstMountedBefore);
  });

  it("keeps loaded history mounted when the user returns to the bottom", () => {
    const messages = makeMessages(200);
    const { container } = renderList(messages);

    act(() => IntersectionObserverProbe.instances.at(-1)?.intersect());
    const loadedCount = mountedCount(container);
    expect(loadedCount).toBeGreaterThan(InitialMessages);
    act(() => IntersectionObserverProbe.instances.at(-1)?.intersect(false));

    const viewport = setViewportScrollTop(container, 600);
    fireEvent.scroll(viewport);

    expect(mountedCount(container)).toBe(loadedCount);
  });

  it("resets the range to the tail budget when a new user message is appended", () => {
    const messages = makeMessages(200);
    const { container, rerender } = renderList(messages);

    act(() => IntersectionObserverProbe.instances.at(-1)?.intersect());
    expect(mountedCount(container)).toBeGreaterThan(InitialMessages);

    const grown = [...messages, makeMessage(200)];
    rerender(<MessageListProbe messages={grown} />);

    expect(mountedCount(container)).toBe(InitialMessages);
    expect(mountedMessageIds(container).at(-1)).toContain("user 200");
  });

  it("resets the range when a user and assistant are appended together", () => {
    const messages = makeMessages(200);
    const { container, rerender } = renderList(messages);

    act(() => IntersectionObserverProbe.instances.at(-1)?.intersect());
    expect(mountedCount(container)).toBeGreaterThan(InitialMessages);

    rerender(
      <MessageListProbe
        messages={[...messages, makeMessage(200), makeMessage(201)]}
      />,
    );

    expect(mountedCount(container)).toBe(InitialMessages);
    expect(mountedMessageIds(container).at(-1)).toContain("assistant 201");
  });

  it("uses the tail budget in the first commit after a user message is appended", () => {
    const messages = makeMessages(200);
    let root: HTMLElement | null = null;
    const committedCounts: number[] = [];
    const onRender = () => {
      if (root) committedCounts.push(mountedCount(root));
    };
    const view = render(
      <Profiler id="render-range" onRender={onRender}>
        <MessageListProbe messages={messages} />
      </Profiler>,
    );
    root = view.container;

    act(() => IntersectionObserverProbe.instances.at(-1)?.intersect());
    expect(mountedCount(view.container)).toBeGreaterThan(InitialMessages);
    committedCounts.length = 0;

    view.rerender(
      <Profiler id="render-range" onRender={onRender}>
        <MessageListProbe messages={[...messages, makeMessage(200)]} />
      </Profiler>,
    );

    expect(committedCounts).not.toHaveLength(0);
    expect(Math.max(...committedCounts)).toBe(InitialMessages);
  });

  it("renders the tail identically to a full render (absolute index invariant)", () => {
    const messages = makeMessages(200);

    const full = renderList(messages, true);
    const fullItems = Array.from(
      full.container.querySelectorAll('[aria-label^="chat-message-"]'),
    ).map((node) => node.outerHTML);
    full.unmount();

    const paged = renderList(messages);
    const pagedItems = Array.from(
      paged.container.querySelectorAll('[aria-label^="chat-message-"]'),
    ).map((node) => node.outerHTML);

    expect(pagedItems).toEqual(fullItems.slice(-pagedItems.length));
  });

  it("passes targeted context instead of the full message list to tools", () => {
    const messages = makeMessages(4);
    const { container } = renderList(messages, true);
    const tools = Array.from(
      container.querySelectorAll<HTMLElement>('[data-testid="tool-part"]'),
    );

    expect(tools).toHaveLength(2);
    expect(tools[0]?.dataset.isInLatestAssistantMessage).toBe("false");
    expect(tools[1]?.dataset.isInLatestAssistantMessage).toBe("true");
    expect(tools[1]?.dataset.changesOrigin).toBe("commit-1");
    expect(tools[1]?.dataset.changesModified).toBe("commit-3");
    expect(
      tools.every(
        (tool) =>
          tool.dataset.hasMessages === "false" &&
          tool.dataset.hasChanges === "true",
      ),
    ).toBe(true);
  });
});
