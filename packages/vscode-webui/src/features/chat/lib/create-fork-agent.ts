import {
  type BackgroundTaskState,
  type ForkAgentUseCase,
  getLogger,
} from "@getpochi/common";
import { type LiveKitStore, type Message, catalog } from "@getpochi/livekit";
import { type ToolSpecInput, parseToolSpec } from "@getpochi/tools";

const logger = getLogger("CreateForkAgent");

const ForkAgentUseCaseLabels: Record<ForkAgentUseCase, string> = {
  "task-memory": "Task Memory Extraction",
  "auto-memory": "Auto Memory Extraction",
  "auto-memory-dream": "Auto Memory Dream",
};

/**
 * Build a human-readable title for a fork agent so it can be identified in
 * task lists. The use-case is rendered as a bracketed tag so it stands out
 * from the parent task title. Callers compose the title and pass it in via
 * {@link CreateForkAgentOptions.initTitle}.
 *
 * Examples:
 *   buildForkAgentInitTitle("task-memory")              -> "[Task Memory Extraction]"
 *   buildForkAgentInitTitle("auto-memory", "Refactor")  -> "[Auto Memory Extraction] Refactor"
 */
export function buildForkAgentInitTitle(
  useCase: ForkAgentUseCase,
  parentTaskTitle?: string,
): string {
  const useCaseLabel = ForkAgentUseCaseLabels[useCase];
  const parent = parentTaskTitle?.trim();
  return parent ? `[${useCaseLabel}] ${parent}` : `[${useCaseLabel}]`;
}

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
  label: ForkAgentUseCase;
}

export interface CreateForkAgentOptions {
  store: LiveKitStore;
  label: ForkAgentUseCase;
  initTitle?: string;
  parentTaskId?: string;
  parentMessages: Message[];
  parentCwd: string | undefined;
  directive: string;
  tools?: readonly ToolSpecInput[];
  setBackgroundTaskState: (
    taskId: string,
    state: BackgroundTaskState,
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

  logger.debug(
    {
      taskId,
      label: options.label,
      initTitle: options.initTitle,
      parentTaskId: options.parentTaskId,
      parentCwd: options.parentCwd,
      parentMessages: options.parentMessages.length,
      initMessages: initMessages.length,
      tools: options.tools?.length,
    },
    "Creating background fork agent",
  );

  const backgroundTaskState: BackgroundTaskState = {
    parentTaskId: options.parentTaskId,
    tools: options.tools ? ensureAttemptCompletion(options.tools) : undefined,
    useCase: options.label,
  };
  logger.debug(
    {
      taskId,
      parentTaskId: backgroundTaskState.parentTaskId,
      tools: backgroundTaskState.tools?.length,
      useCase: backgroundTaskState.useCase,
    },
    "Persisting background fork agent state",
  );
  await options.setBackgroundTaskState(taskId, backgroundTaskState);

  options.store.commit(
    catalog.events.taskInited({
      id: taskId,
      cwd: options.parentCwd,
      background: true,
      createdAt: new Date(),
      initMessages,
      initTitle: options.initTitle,
    }),
  );

  logger.debug(
    { taskId, label: options.label, initTitle: options.initTitle },
    "Background fork agent initialized",
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
