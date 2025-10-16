import type { Message, Task } from "@getpochi/livekit";
import Emittery from "emittery";

export type TaskSyncData = Task & { messages: Message[] };

export const taskSync = {
  event: new Emittery<{ taskSync: TaskSyncData }>(),
  emit: async (task: TaskSyncData) => {
    await taskSync.ready();
    await taskSync.event.emit("taskSync", task);
  },
  ready: () => {
    return new Promise<void>((resolve) => {
      if (taskSync.event.listenerCount("taskSync") > 0) {
        resolve();
      } else {
        const unsubscribe = taskSync.event.on(Emittery.listenerAdded, () => {
          if (taskSync.event.listenerCount("taskSync") > 0) {
            resolve();
            unsubscribe();
          }
        });
      }
    });
  },
  on: (listener: (task: TaskSyncData) => void) => {
    return taskSync.event.on("taskSync", listener);
  },
};
