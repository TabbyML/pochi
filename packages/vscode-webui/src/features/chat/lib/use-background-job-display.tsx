import type { Message } from "@getpochi/livekit";
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useMemo,
} from "react";

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * A job id used as the file name of its output transcript, e.g.
 * `pochi://~/background-jobs/bgjob-cmd-abc.log`. Such ids must stay intact,
 * otherwise the rendered path no longer points at a real file.
 */
const isOutputFilePathId = (text: string, start: number, length: number) => {
  const charBefore = text[start - 1];
  return (
    (charBefore === "/" || charBefore === "\\") &&
    text.startsWith(".log", start + length)
  );
};

export const useBackgroundJobDisplay = (messages: Message[]) => {
  const jobids = useMemo(() => {
    const ids = new Set<string>();
    const parts = messages.flatMap((msg) => msg.parts);
    for (const p of parts) {
      if (
        p.type === "tool-executeCommand" &&
        p.state !== "input-streaming" &&
        p.output?._meta?.backgroundJobId
      ) {
        ids.add(p.output._meta.backgroundJobId);
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
        p.type === "tool-executeCommand" &&
        p.state !== "input-streaming" &&
        p.input?.command &&
        p.output?._meta?.backgroundJobId
      ) {
        map.set(p.output._meta.backgroundJobId, {
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
      if (displayInfo.size === 0) return content;

      const pattern = new RegExp(
        Array.from(displayInfo.keys()).map(escapeRegExp).join("|"),
        "g",
      );
      return content.replace(
        pattern,
        (jobId: string, offset: number, text: string) =>
          isOutputFilePathId(text, offset, jobId.length)
            ? jobId
            : (displayInfo.get(jobId)?.displayId ?? jobId),
      );
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
      getJobDisplayId: () => "",
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
  const { getJobDisplayId, getJobCommand } = useBackgroundJobContext();
  if (!backgroundJobId) return;

  return {
    command: getJobCommand(backgroundJobId),
    displayId: getJobDisplayId(backgroundJobId),
  };
};
