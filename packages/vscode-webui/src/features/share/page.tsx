import { FilesProvider } from "@/components/files-provider";
import { MessageList } from "@/components/message/message-list";
import { VSCodeWebProvider } from "@/components/vscode-web-provider";
import { ChatContextProvider } from "@/features/chat";
import { cn } from "@/lib/utils";
import { formatters } from "@getpochi/common";
import { type ResizeEvent, ShareEvent } from "@getpochi/common/share-utils";
import type { Message } from "@getpochi/livekit";
import type { Todo } from "@getpochi/tools";
import { createChannel } from "bidc";
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ErrorMessageView } from "../chat/components/error-message-view";
import { TodoList, useTodos } from "../todo";

type BIDCChannel = ReturnType<typeof createChannel>;

export function SharePage() {
  const [channel, setChannel] = useState<BIDCChannel | undefined>();

  const shareData = useShareData({
    isStorePathname: isStorePathname(),
    channel: isStorePathname() ? undefined : channel,
  });

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
    user,
    assistant,
    files,
    isLoading = false,
    error,
  } = shareData || {};

  const renderMessages = useMemo(
    () => formatters.shareUI(messages as Message[]),
    [messages],
  );

  const todosRef = useRef<Todo[]>((shareData?.todos ?? []) as Todo[]);

  const { todos } = useTodos({
    initialTodos: shareData?.todos,
    messages: messages as Message[],
    todosRef,
  });

  return (
    <VSCodeWebProvider>
      <ChatContextProvider>
        <FilesProvider defaultFiles={files}>
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
                    hideUserEditsActions
                  />
                  <ErrorMessageView error={error ?? undefined} />
                </div>
                {todos && todos.length > 0 && (
                  <div className="col-span-1">
                    <TodoList
                      todos={todos}
                      className="px-4 md:px-0"
                      disableCollapse
                      disableInProgressTodoTitle
                    >
                      <TodoList.Header />
                      <TodoList.Items />
                    </TodoList>
                  </div>
                )}
              </div>
            )}
          </div>
        </FilesProvider>
      </ChatContextProvider>
    </VSCodeWebProvider>
  );
}

function useShareData({
  isStorePathname,
  channel,
}: { channel?: BIDCChannel | undefined; isStorePathname: boolean }) {
  const [data, setData] = useState<ShareEvent>();

  const fetchCfShareData = useCallback(() => {
    const api = location.pathname.replace("/html", "/json");
    const token = getTokenFromHash();
    fetch(
      api,
      token
        ? {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        : undefined,
    )
      .then(async (res) => {
        const data = await res.json();
        const parsed = ShareEvent.parse(data);
        setData(parsed);
      })
      .catch((err) => {
        console.error("Failed to fetch share data", err);
      });
  }, []);

  const subscribeChannelData = useCallback(() => {
    if (!channel) return;
    channel.receive((data) => {
      setData(ShareEvent.parse(data));
    });
  }, [channel]);

  useEffect(() => {
    if (isStorePathname) {
      fetchCfShareData();
    } else {
      subscribeChannelData();
    }
  }, [isStorePathname, fetchCfShareData, subscribeChannelData]);

  return data;
}

function isStorePathname() {
  const regex = /\/stores\/([^\/]+)\/tasks\/([^\/]+)\/html/;
  const match = location.pathname.match(regex);
  return !!match;
}

function getTokenFromHash() {
  const hash = window.location.hash.substring(1); // Remove the # character
  if (hash) {
    const hashParams = new URLSearchParams(hash);
    return hashParams.get("token");
  }
}
