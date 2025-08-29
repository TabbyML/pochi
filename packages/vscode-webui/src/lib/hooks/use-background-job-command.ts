import type { Message } from "@getpochi/livekit";
import { useMemo } from "react";

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

let currentDisplayId = 1;
const displayIds = new Map<string, number>();
const getDisplayId = (jobId: string) => {
  if (!displayIds.has(jobId)) {
    displayIds.set(jobId, currentDisplayId++);
  }
  return `%${displayIds.get(jobId)}`;
};

/**
 * replace all background job id in content to display id
 * @param content
 */
export const processBackgroundJobId = (content: string): string => {
  let newContent = content;
  for (const [jobId, displayId] of displayIds) {
    newContent = newContent.replace(new RegExp(jobId, "g"), `%${displayId}`);
  }
  return newContent;
};

export const useBackgroundJobDisplayId = (
  backgroundJobId?: string,
): string | undefined => {
  return backgroundJobId ? getDisplayId(backgroundJobId) : undefined;
};

export const useBackgroundJobInfo = (
  messages: Message[],
  backgroundJobId?: string,
): { command: string; displayId: string } | undefined => {
  if (!backgroundJobId) return;

  // biome-ignore lint/correctness/useExhaustiveDependencies: only recompute on backgroundJobId changes, as command should be in messages(startBackgroundJob should happen before readBackgroundJobOutput and killBackgroundJob)
  const command = useMemo(() => {
    return (
      getBackgroundJobCommandFromMessages(messages, backgroundJobId) ??
      `Job id: ${backgroundJobId}`
    );
  }, [backgroundJobId]);

  return { command, displayId: getDisplayId(backgroundJobId) };
};
