/**
 * BackgroundTaskRunner — headless React component that discovers and drives
 * background tasks (e.g. background fork agents).
 *
 * It queries the store for top-level tasks with `background=true` and a
 * runnable status, then runs each one using a headless LiveChatKit + useChat
 * loop.
 *
 * Task creation is NOT done here. If a task was interrupted (e.g. page closed),
 * remounting this component will resume execution automatically.
 */

import { useDefaultStore } from "@/lib/use-default-store";
import { catalog } from "@getpochi/livekit";
import { useRef } from "react";
import { BatchExecuteManager } from "../lib/batch-execute-manager";
import { BackgroundTaskWorker } from "./background-task-worker";

export function BackgroundTaskRunner() {
  const store = useDefaultStore();
  const runnableTasks = store.useQuery(catalog.queries.runnableTasks$);

  const batchExecuteManager = useRef(new BatchExecuteManager()).current;

  if (runnableTasks.length === 0) return null;

  return (
    <>
      {runnableTasks.map((task) => (
        <BackgroundTaskWorker
          key={task.id}
          taskId={task.id}
          batchExecuteManager={batchExecuteManager}
        />
      ))}
    </>
  );
}
