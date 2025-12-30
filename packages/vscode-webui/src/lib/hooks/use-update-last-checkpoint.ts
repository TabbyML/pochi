import { type Message, catalog } from "@getpochi/livekit";
import { ToolsByPermission } from "@getpochi/tools";
import { useStore } from "@livestore/react";
import { useEffect, useMemo } from "react";

export const useUpdateLastCheckpoint = (
  taskId: string,
  messages: Message[],
) => {
  const { store } = useStore();

  const lastCheckpointHash = useMemo(
    () =>
      messages
        .flatMap((m) => m.parts)
        .findLast((p) => p.type === "data-checkpoint")?.data.commit,
    [messages],
  );

  // check that after the last checkpoint, there are no write or execute toolcalls.
  const hasCleanCheckpoint = useMemo(() => {
    return (
      messages
        .flatMap((m) => m.parts)
        .filter(
          (p) =>
            p.type === "data-checkpoint" ||
            ToolsByPermission.write.some((tool) => p.type === `tool-${tool}`) ||
            ToolsByPermission.execute.some((tool) => p.type === `tool-${tool}`),
        )
        .at(-1)?.type === "data-checkpoint"
    );
  }, [messages]);

  useEffect(() => {
    if (hasCleanCheckpoint && lastCheckpointHash) {
      store.commit(
        catalog.events.updateLastCheckpointHash({
          id: taskId,
          lastCheckpointHash,
          updatedAt: new Date(),
        }),
      );
    } else {
      store.commit(
        catalog.events.updateLastCheckpointHash({
          id: taskId,
          lastCheckpointHash: null,
          updatedAt: new Date(),
        }),
      );
    }
  }, [hasCleanCheckpoint, lastCheckpointHash, store.commit, taskId]);
};
