import { MessageList } from "@/components/message/message-list";
import { VSCodeWebProvider } from "@/components/vscode-web-provider";
import { ChatContextProvider } from "@/features/chat";
import { cn } from "@/lib/utils";
import { formatters } from "@getpochi/common";
import type { Message } from "@getpochi/livekit";
import { Todo } from "@getpochi/tools";
import { createChannel } from "bidc";
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import z from "zod";
import { ErrorMessageView } from "../chat/components/error-message-view";
import { TodoList } from "../todo";

type BIDCChannel = ReturnType<typeof createChannel>;

export function SharePage() {
  const [channel, setChannel] = useState<BIDCChannel | undefined>();
  const shareData = isStorePathname()
    ? useCFShareData()
    : useShareData(channel);

  const isChannelCreated = useRef(false);

  useEffect(() => {
    if (isChannelCreated.current) return;

    isChannelCreated.current = true;
    try {
      setChannel(createChannel());
    } catch (e) {
      console.error(e);
    }
  }, []);

  // Set up ResizeObserver to monitor content height and send updates to parent
  const monitorHeight = useCallback(
    (element: HTMLElement | null) => {
      if (!element || !channel) return;

      const resizeObserver = new ResizeObserver(() => {
        channel.send({
          type: "resize",
          height: element.clientHeight,
        } satisfies ResizeEvent);
      });

      resizeObserver.observe(element);

      // Also observe document.body for better coverage
      if (document.body) {
        resizeObserver.observe(document.body);
      }

      return () => resizeObserver.disconnect();
    },
    [channel],
  );

  const {
    messages = [],
    todos = [],
    user,
    assistant,
    isLoading = false,
    error,
  } = shareData || {};

  const renderMessages = useMemo(() => formatters.ui(messages), [messages]);
  return (
    <VSCodeWebProvider>
      <ChatContextProvider>
        <div>
          {/* todo skeleton outside? */}
          {messages.length === 0 ? (
            <div className="flex min-h-screen items-center justify-center">
              <Loader2 className="size-6 animate-spin" />
            </div>
          ) : (
            <div
              ref={monitorHeight}
              className={cn("grid grid-cols-1 gap-3", {
                "md:grid-cols-4": todos && todos.length > 0,
              })}
            >
              <div
                className={cn("col-span-1", {
                  "md:col-span-3": todos && todos.length > 0,
                })}
              >
                <MessageList
                  user={user}
                  assistant={assistant}
                  messages={renderMessages}
                  isLoading={isLoading}
                />
                <ErrorMessageView error={error ?? undefined} />
              </div>
              {todos && todos.length > 0 && (
                <div className="col-span-1">
                  <TodoList
                    todos={todos}
                    className="[&>.todo-border]:!hidden px-4 md:px-0"
                  >
                    <TodoList.Header
                      disableCollapse={true}
                      disableInProgressTodoTitle={true}
                    />
                    <TodoList.Items />
                  </TodoList>
                </div>
              )}
            </div>
          )}
        </div>
      </ChatContextProvider>
    </VSCodeWebProvider>
  );
}

const ZodResizeEvent = z.object({
  type: z.literal("resize"),
  height: z.number(),
});

type ResizeEvent = z.infer<typeof ZodResizeEvent>;

const ZodShareEvent = z.object({
  type: z.literal("share"),
  messages: z.array(z.custom<Message>()).optional(),
  user: z
    .object({
      name: z.string(),
      image: z.string().optional().nullable(),
    })
    .optional(),
  assistant: z
    .object({
      name: z.string(),
      image: z.string().optional().nullable(),
    })
    .optional(),
  todos: z.array(Todo).optional(),
  isLoading: z.boolean().optional(),
  error: z
    .object({
      message: z.string(),
    })
    .optional()
    .nullable(),
});

type ShareEvent = z.infer<typeof ZodShareEvent>;

function useShareData(channel: BIDCChannel | undefined) {
  const [data, setData] = useState<ShareEvent>();
  useEffect(() => {
    if (!channel) return;
    channel.receive((data) => {
      setData(ZodShareEvent.parse(data));
    });
  }, [channel]);
  return data;
}

function useCFShareData() {
  const api = location.pathname.replace("/html", "");
  const [data, setData] = useState<ShareEvent>();
  useEffect(() => {
    fetch(api)
      .then(async (res) => {
        const data = await res.json();
        const parsed = ZodShareEvent.parse(data);
        setData(parsed);
      })
      .catch((err) => {
        console.error("Failed to fetch share data", err);
      });
  }, [api]);
  return data;
}

function isStorePathname() {
  const regex = /\/stores\/([^\/]+)\/tasks\/([^\/]+)\/html/;
  const match = location.pathname.match(regex);
  return !!match;
}
