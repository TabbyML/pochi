import type { Message } from "@getpochi/livekit";
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useMemo,
} from "react";

export const useBackgroundJobDisplay = (messages: Message[]) => {
  const jobids = useMemo(() => {
    const ids = new Set<string>();
    const parts = messages.flatMap((msg) => msg.parts);
    for (const p of parts) {
      if (
        p.type === "tool-startBackgroundJob" &&
        p.state !== "input-streaming" &&
        p.output?.backgroundJobId
      ) {
        ids.add(p.output.backgroundJobId);
      }
    }
    return Array.from(ids).toString();
  }, [messages]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: only recompute when we start new background job
  const displayInfo = useMemo(() => {
    const map = new Map<string, { displayId: string; command: string }>();
    const parts = messages.flatMap((msg) => msg.parts);
    for (const p of parts) {
      if (
        p.type === "tool-startBackgroundJob" &&
        p.state !== "input-streaming" &&
        p.input?.command &&
        p.output?.backgroundJobId
      ) {
        map.set(p.output?.backgroundJobId, {
          displayId: `%${map.size + 1}`,
          command: p.input.command,
        });
      }
    }

    return map;
  }, [jobids]);

  const getJobDisplayId = useCallback(
    (jobId: string) => {
      return displayInfo.get(jobId)?.displayId ?? `job id: ${jobId}`;
    },
    [displayInfo],
  );

  const replaceJobIdsInContent = useCallback(
    (content: string) => {
      let newContent = content;
      for (const [jobId, { displayId }] of displayInfo) {
        newContent = newContent.replace(new RegExp(jobId, "g"), displayId);
      }
      return newContent;
    },
    [displayInfo],
  );

  const getJobCommand = useCallback(
    (jobId: string) => {
      return displayInfo.get(jobId)?.command;
    },
    [displayInfo],
  );

  return { getJobDisplayId, replaceJobIdsInContent, getJobCommand };
};

interface BackgroundJobContext {
  getJobDisplayId: (jobId: string) => string;
  replaceJobIdsInContent: (content: string) => string;
  getJobCommand: (jobId: string) => string | undefined;
}

const BackgroundJobContext = createContext<BackgroundJobContext | undefined>(
  undefined,
);

export const BackgroundJobContextProvider = ({
  children,
  messages,
}: { children: ReactNode; messages: Message[] }) => {
  const { getJobDisplayId, replaceJobIdsInContent, getJobCommand } =
    useBackgroundJobDisplay(messages);

  return (
    <BackgroundJobContext.Provider
      value={{ getJobDisplayId, replaceJobIdsInContent, getJobCommand }}
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
      getJobDisplayId: (jobId: string) => jobId,
      replaceJobIdsInContent: (content: string) => content,
      getJobCommand: (jobId: string) => jobId,
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

export const useBackgroundJobInfo = (
  backgroundJobId?: string,
): { command: string | undefined; displayId: string } | undefined => {
  if (!backgroundJobId) return;

  const { getJobDisplayId, getJobCommand } = useBackgroundJobContext();

  return {
    command: getJobCommand(backgroundJobId),
    displayId: getJobDisplayId(backgroundJobId),
  };
};
