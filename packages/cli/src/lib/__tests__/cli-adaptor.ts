import type { BackgroundCommandNotification } from "@getpochi/common";
import { makeJobStore } from "../../../../livekit/src/background-job/__tests__/test-store";
import { CliRunningTaskAdaptor } from "../../running-task-adaptor";

export function createTestCliAdaptor(
  options: Partial<ConstructorParameters<typeof CliRunningTaskAdaptor>[0]> = {},
) {
  return new CliRunningTaskAdaptor({
    store: makeJobStore().store,
    blobStore: {} as never,
    llm: { id: "test" } as never,
    cwd: process.cwd(),
    rg: "rg",
    filesystem: {} as never,
    projectMemoryEnabled: false,
    ...options,
  });
}

export function nextCommandResult(
  adaptor: CliRunningTaskAdaptor,
  taskId: string,
) {
  let complete!: (notice: BackgroundCommandNotification) => void;
  const result = new Promise<BackgroundCommandNotification>((resolve) => {
    complete = resolve;
  });
  const subscription = adaptor.commandSource.observeNotifications(
    taskId,
    (notices) => {
      const notice = notices.find((notice) => notice.kind === "command");
      if (notice?.kind === "command") complete(notice);
    },
  );
  return result.finally(async () => {
    (await subscription).dispose();
  });
}
