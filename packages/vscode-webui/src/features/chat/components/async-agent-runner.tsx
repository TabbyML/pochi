/**
 * AsyncAgentRunner — headless React component that discovers and drives
 * async fork agents in the background.
 *
 * It queries the store for top-level tasks with runAsync=true and a runnable
 * status, then runs each one using a headless LiveChatKit + useChat loop.
 *
 * Task creation is NOT done here. If a task was interrupted (e.g. page closed),
 * remounting this component will resume execution automatically.
 */

import { useDefaultStore } from "@/lib/use-default-store";
import { getLogger } from "@getpochi/common";
import { catalog } from "@getpochi/livekit";
import { useEffect, useRef } from "react";
import { BatchExecuteManager } from "../lib/batch-execute-manager";
import { AsyncAgentWorker } from "./async-agent-worker";

const logger = getLogger("AsyncAgentRunner");

export function AsyncAgentRunner() {
  const store = useDefaultStore();
  const runnableTasks = store.useQuery(catalog.queries.runnableTasks$);

  const batchExecuteManager = useRef(new BatchExecuteManager()).current;

  useEffect(() => {
    logger.debug(
      {
        runnableTaskCount: runnableTasks.length,
        taskIds: runnableTasks.map((task) => task.id),
      },
      "Async runnable tasks updated",
    );
  }, [runnableTasks]);

  if (runnableTasks.length === 0) return null;

  return (
    <>
      {runnableTasks.map((task) => (
        <AsyncAgentWorker
          key={task.id}
          taskId={task.id}
          batchExecuteManager={batchExecuteManager}
        />
      ))}
    </>
  );
}
