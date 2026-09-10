import { formatters } from "@getpochi/common";
import type { Message } from "@getpochi/livekit";
import type { Meta, StoryObj } from "@storybook/react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";
import { ChatArea } from "../../features/chat/components/chat-area";
import { useScrollToBottom } from "../../features/chat/hooks/use-scroll-to-bottom";
import {
  appendTaskHistoryTurn,
  makeTaskHistoryMessages,
  summarizeTaskHistory,
  updateTaskHistoryStream,
} from "./perf-data";
import {
  MeasuredProfiler,
  PerfPanel,
  type PerfRecord,
  readUsedJsHeapBytes,
  usePerfHarness,
  waitForStablePerfElementCount,
} from "./perf-harness";

interface TaskHistoryPerfStoryProps {
  initialMessageCount: number;
  assistantPartsPerMessage: number;
  partTextLength: number;
  streamChunkSize: number;
  streamIntervalMs: number;
  renderAllMessages?: boolean;
}

export function TaskHistoryPerfStory({
  initialMessageCount,
  assistantPartsPerMessage,
  partTextLength,
  streamChunkSize,
  streamIntervalMs,
  renderAllMessages = false,
}: TaskHistoryPerfStoryProps) {
  const perf = usePerfHarness();
  const historyRef = useRef<HTMLDivElement | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const formatterMsByMessagesRef = useRef(new WeakMap<Message[], number>());
  const heapAfterFormatByMessagesRef = useRef(
    new WeakMap<Message[], number | undefined>(),
  );
  const revisionByMessagesRef = useRef(new WeakMap<Message[], number>());
  const nextRevisionRef = useRef(0);
  const committedRevisionRef = useRef(-1);
  const commitWaitersRef = useRef(new Map<number, Set<() => void>>());
  const timerRef = useRef<number | null>(null);
  const streamingRef = useRef(false);
  const mountedRef = useRef(true);
  const streamChunkSizeRef = useRef(streamChunkSize);
  const streamIntervalMsRef = useRef(streamIntervalMs);
  const updateCountRef = useRef(0);
  const turnIndexRef = useRef(Math.ceil(initialMessageCount / 2));
  const initialArgsRef = useRef(
    `${initialMessageCount}:${assistantPartsPerMessage}:${partTextLength}`,
  );
  const [rawMessages, setRawMessages] = useState<Message[]>(() => {
    const messages = makeTaskHistoryMessages({
      messageCount: initialMessageCount,
      assistantPartsPerMessage,
      partTextLength,
    });
    revisionByMessagesRef.current.set(messages, 0);
    return messages;
  });
  const rawMessagesRef = useRef(rawMessages);
  const [summary, setSummary] = useState(() =>
    summarizeTaskHistory(rawMessages),
  );
  const [updateCount, setUpdateCount] = useState(0);
  const [mounted, setMounted] = useState(true);
  const [renderKey, setRenderKey] = useState(0);
  const [isStreaming, setIsStreaming] = useState(false);
  const [runtimeAction, setRuntimeAction] = useState<string | null>(null);
  streamChunkSizeRef.current = streamChunkSize;
  streamIntervalMsRef.current = streamIntervalMs;

  const assignRevision = useCallback((messages: Message[]) => {
    const revision = nextRevisionRef.current + 1;
    nextRevisionRef.current = revision;
    revisionByMessagesRef.current.set(messages, revision);
    return revision;
  }, []);

  const acknowledgeCommittedRevision = useCallback((revision: number) => {
    committedRevisionRef.current = Math.max(
      committedRevisionRef.current,
      revision,
    );
    for (const [waitingRevision, resolvers] of commitWaitersRef.current) {
      if (waitingRevision > committedRevisionRef.current) continue;
      commitWaitersRef.current.delete(waitingRevision);
      for (const resolve of resolvers) resolve();
    }
  }, []);

  const resolveCommitWaiters = useCallback(() => {
    for (const resolvers of commitWaitersRef.current.values()) {
      for (const resolve of resolvers) resolve();
    }
    commitWaitersRef.current.clear();
  }, []);

  const waitForCommittedRevision = (revision: number) => {
    if (!mountedRef.current || committedRevisionRef.current >= revision) {
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      const resolvers = commitWaitersRef.current.get(revision) ?? new Set();
      resolvers.add(resolve);
      commitWaitersRef.current.set(revision, resolvers);
    });
  };

  const formatVisibleMessages = useCallback(
    (visibleMessages: Message[]) => {
      const startedAt = performance.now();
      const formatted = formatters.ui(visibleMessages);
      formatterMsByMessagesRef.current.set(
        rawMessages,
        performance.now() - startedAt,
      );
      heapAfterFormatByMessagesRef.current.set(
        rawMessages,
        readUsedJsHeapBytes(),
      );
      return formatted;
    },
    [rawMessages],
  );

  useEffect(() => {
    const nextArgs = `${initialMessageCount}:${assistantPartsPerMessage}:${partTextLength}`;
    if (nextArgs === initialArgsRef.current) return;
    initialArgsRef.current = nextArgs;

    streamingRef.current = false;
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    const nextMessages = makeTaskHistoryMessages({
      messageCount: initialMessageCount,
      assistantPartsPerMessage,
      partTextLength,
    });
    assignRevision(nextMessages);
    rawMessagesRef.current = nextMessages;
    updateCountRef.current = 0;
    turnIndexRef.current = Math.ceil(initialMessageCount / 2);
    setRawMessages(nextMessages);
    setSummary(summarizeTaskHistory(nextMessages));
    setUpdateCount(0);
    setIsStreaming(false);
    setRuntimeAction(null);
  }, [
    assignRevision,
    assistantPartsPerMessage,
    initialMessageCount,
    partTextLength,
  ]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      streamingRef.current = false;
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
      resolveCommitWaiters();
    };
  }, [resolveCommitWaiters]);

  const waitForHistory = (minCount: number) =>
    waitForStablePerfElementCount(historyRef, {
      minCount,
      timeoutMs: 15_000,
    });

  const pipelineMetrics = (
    messages: Message[][],
    structuredCloneMs = 0,
    jsHeapAfterCloneBytes?: number,
  ) => {
    const heapAfterFormatSamples = messages
      .map((item) => heapAfterFormatByMessagesRef.current.get(item))
      .filter((value): value is number => value !== undefined);

    return {
      structuredCloneMs,
      formatterMs: messages.reduce(
        (total, item) =>
          total + (formatterMsByMessagesRef.current.get(item) ?? 0),
        0,
      ),
      jsHeapAfterCloneBytes,
      jsHeapAfterFormatBytes:
        heapAfterFormatSamples.length > 0
          ? Math.max(...heapAfterFormatSamples)
          : undefined,
    };
  };

  const stopStreaming = () => {
    streamingRef.current = false;
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setIsStreaming(false);
    setRuntimeAction(`Streaming stopped · ${updateCountRef.current} updates`);
  };

  const resetHistory = () => {
    stopStreaming();
    const nextMessages = makeTaskHistoryMessages({
      messageCount: initialMessageCount,
      assistantPartsPerMessage,
      partTextLength,
    });
    const nextRevision = assignRevision(nextMessages);
    const nextSummary = summarizeTaskHistory(nextMessages);
    updateCountRef.current = 0;
    turnIndexRef.current = Math.ceil(initialMessageCount / 2);
    const action = `Reset history applied · messages ${rawMessagesRef.current.length} → ${nextMessages.length}`;

    void perf.measureAction(
      "reset task history",
      () => {
        rawMessagesRef.current = nextMessages;
        setRawMessages(nextMessages);
        setSummary(nextSummary);
        setUpdateCount(0);
        setRuntimeAction(action);
      },
      {
        target: historyRef.current,
        afterAction: () => waitForCommittedRevision(nextRevision),
        metrics: () => pipelineMetrics([nextMessages]),
      },
    );
  };

  const appendTurn = () => {
    const currentMessages = rawMessagesRef.current;
    const addedMessages = appendTaskHistoryTurn([], {
      turnIndex: turnIndexRef.current,
      assistantPartsPerMessage,
      partTextLength,
    });
    const [userMessage, assistantMessage] = addedMessages;
    if (!userMessage || !assistantMessage) return;
    const messagesWithUser = [...currentMessages, userMessage];
    const nextMessages = [...currentMessages, ...addedMessages];
    assignRevision(messagesWithUser);
    const nextRevision = assignRevision(nextMessages);
    const userSummary = summarizeTaskHistory([userMessage]);
    const assistantSummary = summarizeTaskHistory([assistantMessage]);
    const action = `Append turn applied · messages ${currentMessages.length} → ${nextMessages.length}`;

    void perf.measureAction(
      "append user + assistant turn",
      () => {
        turnIndexRef.current += 1;
        flushSync(() => {
          rawMessagesRef.current = messagesWithUser;
          setRawMessages(messagesWithUser);
          setSummary((current) => ({
            messageCount: messagesWithUser.length,
            partCount: current.partCount + userSummary.partCount,
            serializedBytes:
              current.serializedBytes + userSummary.serializedBytes - 1,
          }));
        });

        rawMessagesRef.current = nextMessages;
        setRawMessages(nextMessages);
        setSummary((current) => ({
          messageCount: nextMessages.length,
          partCount: current.partCount + assistantSummary.partCount,
          serializedBytes:
            current.serializedBytes + assistantSummary.serializedBytes - 1,
        }));
        setRuntimeAction(action);
      },
      {
        target: historyRef.current,
        afterAction: () => waitForCommittedRevision(nextRevision),
        metrics: () => pipelineMetrics([messagesWithUser, nextMessages]),
      },
    );
  };

  const streamTick = (measureNodes = true) => {
    const nextUpdateCount = updateCountRef.current + 1;
    const chunkSize = streamChunkSizeRef.current;
    let structuredCloneMs = 0;
    let jsHeapAfterCloneBytes: number | undefined;
    let nextMessagesForMetrics = rawMessagesRef.current;
    let nextRevisionForMetrics = nextRevisionRef.current;
    const action = `Stream tick applied · update ${nextUpdateCount} · +${chunkSize} chars`;

    return perf.measureAction(
      "assistant stream tick",
      () => {
        const nextMessages = updateTaskHistoryStream(rawMessagesRef.current, {
          updateIndex: nextUpdateCount,
          chunkSize,
          snapshot: (message) => {
            const startedAt = performance.now();
            const snapshot = structuredClone(message);
            structuredCloneMs = performance.now() - startedAt;
            jsHeapAfterCloneBytes = readUsedJsHeapBytes();
            return snapshot;
          },
        });
        nextRevisionForMetrics = assignRevision(nextMessages);
        nextMessagesForMetrics = nextMessages;
        rawMessagesRef.current = nextMessages;
        updateCountRef.current = nextUpdateCount;
        setRawMessages(nextMessages);
        setUpdateCount(nextUpdateCount);
        setSummary((current) => ({
          ...current,
          serializedBytes: current.serializedBytes + chunkSize,
        }));
        setRuntimeAction(action);
      },
      {
        target: historyRef.current,
        measureNodes,
        afterAction: () => waitForCommittedRevision(nextRevisionForMetrics),
        metrics: () =>
          pipelineMetrics(
            [nextMessagesForMetrics],
            structuredCloneMs,
            jsHeapAfterCloneBytes,
          ),
      },
    );
  };

  const scheduleStreamTick = () => {
    if (!streamingRef.current) return;
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      if (!streamingRef.current) return;
      scheduleStreamTick();
      void streamTick(false);
    }, streamIntervalMsRef.current);
  };

  const startStreaming = () => {
    if (streamingRef.current) return;
    streamingRef.current = true;
    setIsStreaming(true);
    scheduleStreamTick();
    void streamTick(false);
  };

  const measureUiAction = (
    label: string,
    action: () => void,
    minCount: number,
  ) =>
    perf.measureAction(label, action, {
      target: historyRef.current,
      afterAction: () => waitForHistory(minCount),
    });

  return (
    <div ref={perf.rootRef} className="flex h-[760px] flex-col p-3">
      <PerfPanel
        recordsRef={perf.recordsRef}
        onClear={perf.clear}
        onSampleFrames={() => void perf.sampleFrames("manual frame sample")}
      />

      <div className="mb-2 grid grid-cols-2 gap-2 rounded border p-2 text-xs md:grid-cols-5">
        <Stat
          label="messages"
          value={summary.messageCount}
          valueTestId="task-history-message-count"
        />
        <Stat label="parts" value={summary.partCount} />
        <Stat
          label="stream updates"
          value={updateCount}
          valueTestId="task-history-update-count"
        />
        <Stat
          label="approx size"
          value={formatBytes(summary.serializedBytes)}
        />
        <Stat label="UI" value={mounted ? "mounted" : "unmounted"} />
      </div>

      <div className="mb-2 flex flex-wrap gap-2">
        <ActionButton onClick={resetHistory}>Reset history</ActionButton>
        <ActionButton onClick={appendTurn}>Append turn</ActionButton>
        <ActionButton disabled={isStreaming} onClick={() => void streamTick()}>
          Stream tick
        </ActionButton>
        <ActionButton disabled={isStreaming} onClick={startStreaming}>
          Start streaming
        </ActionButton>
        <ActionButton disabled={!isStreaming} onClick={stopStreaming}>
          Stop streaming
        </ActionButton>
      </div>

      <output
        aria-live="polite"
        className="mb-2 rounded border bg-[var(--vscode-editor-background)] px-2 py-1 text-xs"
      >
        {runtimeAction
          ? runtimeAction
          : "Ready · use Append turn or Stream tick to update the live task history"}
      </output>

      <details className="mb-2 text-xs">
        <summary className="cursor-pointer text-muted-foreground">
          UI isolation controls
        </summary>
        <div className="mt-2 flex flex-wrap gap-2">
          <ActionButton
            disabled={!mounted}
            onClick={() =>
              void measureUiAction(
                "unmount task UI",
                () => {
                  mountedRef.current = false;
                  resolveCommitWaiters();
                  setMounted(false);
                },
                0,
              )
            }
          >
            Unmount UI
          </ActionButton>
          <ActionButton
            disabled={mounted}
            onClick={() =>
              void measureUiAction(
                "mount task UI",
                () => {
                  mountedRef.current = true;
                  setMounted(true);
                },
                1,
              )
            }
          >
            Mount UI
          </ActionButton>
          <ActionButton
            disabled={!mounted}
            onClick={() =>
              void measureUiAction(
                "remount task UI",
                () => setRenderKey((current) => current + 1),
                1,
              )
            }
          >
            Remount UI
          </ActionButton>
          <span className="self-center text-muted-foreground">
            Unmount keeps raw-message updates active.
          </span>
        </div>
      </details>

      <section ref={historyRef} className="min-h-0 flex-1 overflow-hidden">
        {mounted && (
          <TaskHistoryMessageView
            key={renderKey}
            messages={rawMessages}
            formatMessages={formatVisibleMessages}
            revision={revisionByMessagesRef.current.get(rawMessages) ?? 0}
            isStreaming={isStreaming}
            messagesContainerRef={messagesContainerRef}
            record={perf.record}
            onMessagesCommitted={acknowledgeCommittedRevision}
            renderAllMessages={renderAllMessages}
          />
        )}
      </section>
    </div>
  );
}

function TaskHistoryMessageView({
  messages,
  formatMessages,
  revision,
  isStreaming,
  messagesContainerRef,
  record,
  onMessagesCommitted,
  renderAllMessages,
}: {
  messages: Message[];
  formatMessages: (messages: Message[]) => Message[];
  revision: number;
  isStreaming: boolean;
  messagesContainerRef: React.RefObject<HTMLDivElement | null>;
  record: (record: PerfRecord) => void;
  onMessagesCommitted: (revision: number) => void;
  renderAllMessages: boolean;
}) {
  const lastUserMessageId = messages.findLast(
    (message) => message.role === "user",
  )?.id;
  useScrollToBottom({ messagesContainerRef, lastUserMessageId });
  useLayoutEffect(() => {
    onMessagesCommitted(revision);
  }, [onMessagesCommitted, revision]);

  return (
    <MeasuredProfiler id="TaskHistoryPerf" record={record}>
      <div className="flex h-full min-h-0 flex-col">
        <ChatArea
          messages={messages}
          formatMessages={formatMessages}
          isLoading={isStreaming}
          user={{ name: "User" }}
          messagesContainerRef={messagesContainerRef}
          hideEmptyPlaceholder
          className="min-h-0"
          renderAllMessages={renderAllMessages}
        />
      </div>
    </MeasuredProfiler>
  );
}

function ActionButton({
  children,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="rounded border px-2 py-1 text-xs disabled:opacity-50"
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function Stat({
  label,
  value,
  valueTestId,
}: {
  label: string;
  value: string | number;
  valueTestId?: string;
}) {
  return (
    <div>
      <div className="text-muted-foreground">{label}</div>
      <div data-testid={valueTestId} className="font-medium tabular-nums">
        {value}
      </div>
    </div>
  );
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}

const meta: Meta<typeof TaskHistoryPerfStory> = {
  title: "Perf/TaskHistory",
  component: TaskHistoryPerfStory,
  excludeStories: ["TaskHistoryPerfStory"],
  args: {
    initialMessageCount: 300,
    assistantPartsPerMessage: 30,
    partTextLength: 120,
    streamChunkSize: 32,
    streamIntervalMs: 50,
    renderAllMessages: false,
  },
  argTypes: {
    initialMessageCount: {
      control: "select",
      options: [20, 100, 300, 1000],
    },
    assistantPartsPerMessage: {
      control: "select",
      options: [10, 30, 50, 100],
    },
    partTextLength: {
      control: "select",
      options: [40, 120, 500, 2000],
    },
    streamChunkSize: {
      control: "select",
      options: [16, 32, 128, 512],
    },
    streamIntervalMs: {
      control: "select",
      options: [50, 100, 250, 500],
    },
    renderAllMessages: {
      control: false,
    },
  },
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Full: Story = {
  args: {
    renderAllMessages: true,
  },
};

export const Paged: Story = {
  args: {
    renderAllMessages: false,
  },
};
