import type { BackgroundTaskState } from "@getpochi/common";
import type { BackgroundTaskStateStore } from "@getpochi/livekit";
import { threadSignal } from "@quilted/threads/signals";
import { vscodeHost } from "./vscode";

export function createVscodeBackgroundTaskStateStore(): BackgroundTaskStateStore {
  const entries = new Map<
    string,
    Promise<{
      value: { value: BackgroundTaskState | undefined };
      setBackgroundTaskState: (state: BackgroundTaskState) => Promise<void>;
    }>
  >();

  const getEntry = (taskId: string) => {
    let entry = entries.get(taskId);
    if (!entry) {
      entry = vscodeHost.readBackgroundTaskState(taskId).then((result) => ({
        value: threadSignal(result.value),
        setBackgroundTaskState: result.setBackgroundTaskState,
      }));
      entries.set(taskId, entry);
    }
    return entry;
  };

  return {
    read: async (taskId) => (await getEntry(taskId)).value.value,
    set: async (taskId, state) => {
      await (await getEntry(taskId)).setBackgroundTaskState(state);
    },
  };
}
