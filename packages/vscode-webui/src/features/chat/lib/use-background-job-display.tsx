import type { Message } from "@getpochi/livekit";
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useMemo,
} from "react";

export const useBackgroundJobDisplay = (messages: Message[]) => {
  const displayIds = useMemo(() => {
    const map = new Map<string, number>();
    const parts = messages.flatMap((msg) => msg.parts);
    for (const p of parts) {
      if (p.type === "tool-startBackgroundJob" && p.output?.backgroundJobId) {
        map.set(p.output?.backgroundJobId, map.size + 1);
      }
    }

    return map;
  }, [messages]);

  const mapJobIdToDisplayId = useCallback(
    (jobId: string) => {
      if (displayIds.has(jobId)) {
        return `%${displayIds.get(jobId)}`;
      }
      return `job id: ${jobId}`;
    },
    [displayIds],
  );

  const replaceJobIdsInContent = useCallback(
    (content: string) => {
      let newContent = content;
      for (const [jobId, displayId] of displayIds) {
        newContent = newContent.replace(
          new RegExp(jobId, "g"),
          `%${displayId}`,
        );
      }
      return newContent;
    },
    [displayIds],
  );

  return { mapJobIdToDisplayId, replaceJobIdsInContent };
};

const getBackgroundJobCommandFromMessages = (
  messages: Message[],
  backgroundJobId: string,
): string | undefined => {
  const parts = messages.flatMap((msg) => msg.parts);

  for (const part of parts) {
    if (part.type === "tool-startBackgroundJob") {
      if (part.output?.backgroundJobId === backgroundJobId) {
        return part.input?.command;
      }
    }
  }
};

interface BackgroundJobContext {
  mapJobIdToDisplayId: (jobId: string) => string;
  replaceJobIdsInContent: (content: string) => string;
}

const BackgroundJobContext = createContext<BackgroundJobContext | undefined>(
  undefined,
);

export const BackgroundJobContextProvider = ({
  children,
  messages,
}: { children: ReactNode; messages: Message[] }) => {
  const { mapJobIdToDisplayId, replaceJobIdsInContent } =
    useBackgroundJobDisplay(messages);

  return (
    <BackgroundJobContext.Provider
      value={{ mapJobIdToDisplayId, replaceJobIdsInContent }}
    >
      {children}
    </BackgroundJobContext.Provider>
  );
};

const useBackgroundJobContext = () => {
  const context = useContext(BackgroundJobContext);
  if (!context) {
    console.error(
      "useBackgroundJobContext must be used within a BackgroundJobContextProvider",
    );
    return {
      mapJobIdToDisplayId: (jobId: string) => jobId,
      replaceJobIdsInContent: (content: string) => content,
    };
  }
  return context;
};

/**
 * replace all background job id in content to display id
 * @param content
 */
export const useReplaceJobIdsInContent = () => {
  const { replaceJobIdsInContent } = useBackgroundJobContext();
  return replaceJobIdsInContent;
};

export const useMapJobIdToDisplayId = (
  backgroundJobId?: string,
): string | undefined => {
  const { mapJobIdToDisplayId } = useBackgroundJobContext();
  return backgroundJobId ? mapJobIdToDisplayId(backgroundJobId) : undefined;
};

export const useBackgroundJobInfo = (
  messages: Message[],
  backgroundJobId?: string,
): { command: string; displayId: string } | undefined => {
  if (!backgroundJobId) return;

  const { mapJobIdToDisplayId } = useBackgroundJobContext();

  // biome-ignore lint/correctness/useExhaustiveDependencies: only recompute on backgroundJobId changes, as command should be in messages(startBackgroundJob should happen before readBackgroundJobOutput and killBackgroundJob)
  const command = useMemo(() => {
    return (
      getBackgroundJobCommandFromMessages(messages, backgroundJobId) ??
      `Job id: ${backgroundJobId}`
    );
  }, [backgroundJobId]);

  return { command, displayId: mapJobIdToDisplayId(backgroundJobId) };
};
