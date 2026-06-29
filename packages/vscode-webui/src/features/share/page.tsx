import { FilesProvider } from "@/components/files-provider";
import { MessageList } from "@/components/message/message-list";
import { VSCodeWebProvider } from "@/components/vscode-web-provider";
import { ChatContextProvider } from "@/features/chat";
import { cn } from "@/lib/utils";
import { formatters } from "@getpochi/common";
import { type ResizeEvent, ShareEvent } from "@getpochi/common/share-utils";
import type { Message } from "@getpochi/livekit";
import { createChannel } from "bidc";
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ErrorMessageView } from "../chat/components/error-message-view";
import { TodoList } from "../todo";

type BIDCChannel = ReturnType<typeof createChannel>;

export function SharePage() {
  const [channel, setChannel] = useState<BIDCChannel | undefined>();

  const shareData = useShareData({
    isStorePathname: isStorePathname(),
    channel: isStorePathname() ? undefined : channel,
  });

  const isChannelCreated = useRef(false);
  const dragCounter = useRef(0);

  useEffect(() => {
    if (isChannelCreated.current) return;

    isChannelCreated.current = true;
    try {
      setChannel(createChannel());
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    if (!channel) return;

    const handleDragEnter = () => {
      dragCounter.current += 1;
      if (dragCounter.current === 1) {
        channel.send({ type: "dragenter" });
      }
    };

    const handleDragLeave = () => {
      dragCounter.current = Math.max(0, dragCounter.current - 1);
      if (dragCounter.current === 0) {
        channel.send({ type: "dragleave" });
      }
    };

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
    };

    const handleDrop = async (e: DragEvent) => {
      e.preventDefault();
      dragCounter.current = 0;

      const file = e.dataTransfer?.files?.[0];
      if (!file) return;

      const text = await file.text();
      channel.send({
        type: "drop",
        text,
      });
    };

    const handlePaste = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (const item of Array.from(items)) {
        if (item.kind === "file") {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) {
            const text = await file.text();
            channel.send({
              type: "paste",
              text,
            });
          }
          return;
        }
        if (item.type === "text/plain") {
          e.preventDefault();
          item.getAsString((text) => {
            channel.send({
              type: "paste",
              text,
            });
          });
          return;
        }
      }
    };

    window.addEventListener("dragenter", handleDragEnter);
    window.addEventListener("dragleave", handleDragLeave);
    window.addEventListener("dragover", handleDragOver);
    window.addEventListener("drop", handleDrop);
    window.addEventListener("paste", handlePaste);

    return () => {
      window.removeEventListener("dragenter", handleDragEnter);
      window.removeEventListener("dragleave", handleDragLeave);
      window.removeEventListener("dragover", handleDragOver);
      window.removeEventListener("drop", handleDrop);
      window.removeEventListener("paste", handlePaste);
    };
  }, [channel]);

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

  const todos = shareData?.todos ?? [];

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
