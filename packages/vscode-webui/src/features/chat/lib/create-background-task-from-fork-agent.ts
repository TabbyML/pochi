import { vscodeHost } from "@/lib/vscode";
import type { BackgroundTaskState } from "@getpochi/common";
import type { ForkAgent, ForkAgentHandle } from "@getpochi/common/fork-agent";
import { type LiveKitStore, type Message, catalog } from "@getpochi/livekit";

type CreateBackgroundTaskFromForkAgentOptions = {
  store: LiveKitStore;
  agent: ForkAgent<Message>;
};

export async function createBackgroundTaskFromForkAgent({
  store,
  agent,
}: CreateBackgroundTaskFromForkAgentOptions): Promise<ForkAgentHandle> {
  const taskId = crypto.randomUUID();
  const createdAt = new Date();
  const state = await vscodeHost.readBackgroundTaskState(taskId);
  await state.setBackgroundTaskState(toBackgroundTaskState(agent));

  store.commit(
    catalog.events.taskInited({
      id: taskId,
      cwd: agent.cwd,
      background: true,
      createdAt,
      initMessages: agent.initMessages,
      initTitle: agent.initTitle,
    }),
  );

  return {
    taskId,
    cwd: agent.cwd,
    label: agent.label,
  };
}

function toBackgroundTaskState(agent: ForkAgent<Message>): BackgroundTaskState {
  return {
    parentTaskId: agent.parentTaskId,
    tools: agent.tools,
    useCase: agent.label,
    baselineStepCount: agent.baselineStepCount,
  };
}
