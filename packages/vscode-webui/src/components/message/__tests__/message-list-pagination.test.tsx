import type { Message } from "@getpochi/livekit";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { Profiler, useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MessageListPaginationConfig } from "../use-message-list-pagination";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options?.count === undefined ? key : `${key}:${options.count}`,
  }),
}));

vi.mock("@/lib/vscode", () => ({
  isVSCodeEnvironment: () => false,
  vscodeHost: {
    getGlobalState: vi.fn(async () => undefined),
    setGlobalState: vi.fn(async () => undefined),
  },
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
  ToolInvocationPart: ({
    tool,
    changes,
    isLastPart,
  }: {
    tool: { toolCallId: string };
    changes?: { origin?: string; modified?: string };
    isLastPart?: boolean;
  }) => (
    <div
      data-testid="tool-part"
      data-tool-call-id={tool.toolCallId}
      data-changes-origin={changes?.origin ?? ""}
      data-changes-modified={changes?.modified ?? ""}
      data-is-last-part={String(!!isLastPart)}
    />
  ),
  BackgroundJobPanel: () => null,
}));

vi.mock("../markdown", () => ({
  MessageMarkdown: ({ children }: { children: string }) => (
    <div data-testid="markdown">{children}</div>
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

function MessageListProbe({
  messages,
  renderAllMessages = false,
}: {
  messages: Message[];
  renderAllMessages?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  return (
    <MessageList
      messages={messages}
      isLoading={false}
      showLoader={false}
      renderAllMessages={renderAllMessages}
      containerRef={containerRef}
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

  it("automatically loads earlier messages from the top prefetch area", () => {
    const messages = makeMessages(200);
    const { container } = renderList(messages);

    const autoLoadTrigger = screen.getByTestId(
      "message-list-auto-load-earlier",
    );
    expect(autoLoadTrigger.textContent).toBe("");
    expect(autoLoadTrigger.querySelector("button")).toBeNull();
    expect(IntersectionObserverProbe.instances).toHaveLength(1);

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

  it("shrinks loaded history back to the tail budget when the user returns to the bottom", () => {
    const messages = makeMessages(200);
    const { container } = renderList(messages);

    act(() => IntersectionObserverProbe.instances.at(-1)?.intersect());
    expect(mountedCount(container)).toBeGreaterThan(InitialMessages);
    act(() => IntersectionObserverProbe.instances.at(-1)?.intersect(false));

    const viewport = container.querySelector<HTMLElement>(
      '[data-slot="scroll-area-viewport"]',
    );
    if (!viewport) throw new Error("Expected MessageList viewport");
    Object.defineProperties(viewport, {
      scrollHeight: { configurable: true, value: 1000 },
      clientHeight: { configurable: true, value: 400 },
      scrollTop: { configurable: true, value: 600, writable: true },
    });

    fireEvent.scroll(viewport);

    expect(mountedCount(container)).toBe(InitialMessages);
  });

  it("does not alternate between auto-loading and trimming while the top trigger remains visible", () => {
    const messages = makeMessages(200);
    const { container } = renderList(messages);

    const viewport = container.querySelector<HTMLElement>(
      '[data-slot="scroll-area-viewport"]',
    );
    if (!viewport) throw new Error("Expected MessageList viewport");
    Object.defineProperties(viewport, {
      scrollHeight: { configurable: true, value: 1000 },
      clientHeight: { configurable: true, value: 400 },
      scrollTop: { configurable: true, value: 600, writable: true },
    });

    for (let i = 0; i < 3; i++) {
      const beforeLoad = mountedCount(container);
      act(() => IntersectionObserverProbe.instances.at(-1)?.intersect());
      const afterLoad = mountedCount(container);
      expect(afterLoad).toBeGreaterThan(beforeLoad);

      fireEvent.scroll(viewport);

      expect(mountedCount(container)).toBe(afterLoad);
    }
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
    // Cross-message derivations still include checkpoints outside this page.
    const firstTool = paged.container.querySelector<HTMLElement>(
      '[data-testid="tool-part"]',
    );
    expect(firstTool?.dataset.changesOrigin).toBeTruthy();
  });
});
