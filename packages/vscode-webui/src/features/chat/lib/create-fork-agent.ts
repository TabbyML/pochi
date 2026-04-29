import { getLogger } from "@getpochi/common";
import { type LiveKitStore, type Message, catalog } from "@getpochi/livekit";
import { type ToolSpecInput, parseToolSpec } from "@getpochi/tools";

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
  tools?: readonly ToolSpecInput[];
  setAsyncAgentState?: (
    taskId: string,
    state: { tools?: readonly ToolSpecInput[]; parentTaskId?: string },
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

  if ((options.tools || options.parentTaskId) && !options.setAsyncAgentState) {
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
      tools: options.tools?.length,
    },
    "Creating async fork agent",
  );

  if (options.tools || options.parentTaskId) {
    const asyncAgentState = {
      parentTaskId: options.parentTaskId,
      tools: options.tools ? ensureAttemptCompletion(options.tools) : undefined,
    };
    logger.debug(
      {
        taskId,
        parentTaskId: asyncAgentState.parentTaskId,
        tools: asyncAgentState.tools?.length,
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

function ensureAttemptCompletion(
  tools: readonly ToolSpecInput[],
): readonly ToolSpecInput[] {
  const hasAttemptCompletion = tools.some(
    (tool) => parseToolSpec(tool).name === "attemptCompletion",
  );
  return hasAttemptCompletion ? tools : [...tools, "attemptCompletion"];
}
