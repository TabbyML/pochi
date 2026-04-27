import { getLogger } from "@getpochi/common";
import { type LiveKitStore, type Message, catalog } from "@getpochi/livekit";

const logger = getLogger("CreateForkAgent");

/**
 * Build the init messages for a fork agent: all parent messages followed by
 * a new user message containing the directive.
 */
export function buildForkMessages(
  parentMessages: Message[],
  directive: string,
): Message[] {
  return [
    ...parentMessages.map((message) => ({
      ...structuredClone(message),
      id: crypto.randomUUID(),
    })),
    {
      id: crypto.randomUUID(),
      role: "user",
      parts: [{ type: "text", text: directive }],
    } as Message,
  ];
}

export interface ForkAgentConfig {
  taskId: string;
  cwd: string | undefined;
  label: string;
}

export interface CreateForkAgentOptions {
  store: LiveKitStore;
  label: string;
  parentTaskId?: string;
  parentMessages: Message[];
  parentCwd: string | undefined;
  directive: string;
  allowedTools?: readonly string[];
  setAsyncAgentState?: (
    taskId: string,
    state: { allowedTools?: readonly string[]; parentTaskId?: string },
  ) => Promise<void> | void;
}

export async function createForkAgent(
  options: CreateForkAgentOptions,
): Promise<ForkAgentConfig> {
  const taskId = crypto.randomUUID();
  const initMessages = buildForkMessages(
    options.parentMessages,
    options.directive,
  ) as Message[];

  if (
    (options.allowedTools || options.parentTaskId) &&
    !options.setAsyncAgentState
  ) {
    throw new Error("setAsyncAgentState is required for async agent state");
  }

  logger.debug(
    {
      taskId,
      label: options.label,
      parentTaskId: options.parentTaskId,
      parentCwd: options.parentCwd,
      parentMessages: options.parentMessages.length,
      initMessages: initMessages.length,
      allowedTools: options.allowedTools?.length,
    },
    "Creating async fork agent",
  );

  if (options.allowedTools || options.parentTaskId) {
    const asyncAgentState = {
      parentTaskId: options.parentTaskId,
      allowedTools: options.allowedTools
        ? Array.from(new Set([...options.allowedTools, "attemptCompletion"]))
        : undefined,
    };
    logger.debug(
      {
        taskId,
        parentTaskId: asyncAgentState.parentTaskId,
        allowedTools: asyncAgentState.allowedTools?.length,
      },
      "Persisting async fork agent state",
    );
    await options.setAsyncAgentState?.(taskId, asyncAgentState);
  }

  options.store.commit(
    catalog.events.taskInited({
      id: taskId,
      cwd: options.parentCwd,
      runAsync: true,
      createdAt: new Date(),
      initMessages,
    }),
  );

  logger.debug(
    { taskId, label: options.label },
    "Async fork agent initialized",
  );

  return {
    taskId,
    cwd: options.parentCwd,
    label: options.label,
  };
}
