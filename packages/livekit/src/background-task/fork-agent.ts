import { type ForkAgentUseCase, getLogger } from "@getpochi/common";
import { type ToolSpecInput, parseToolSpec } from "@getpochi/tools";
import type { UIMessage } from "ai";

const logger = getLogger("ForkAgent");

export type ForkAgentHandle = {
  taskId: string;
  cwd: string | undefined;
  label: ForkAgentUseCase;
};

type ForkAgentInput<TMessage extends UIMessage> = {
  label: ForkAgentUseCase;
  initTitle?: string;
  parentTaskId?: string;
  parentMessages: TMessage[];
  parentCwd: string | undefined;
  directive: string;
  tools?: readonly ToolSpecInput[];
};

export type ForkAgent<TMessage extends UIMessage> = {
  cwd: string | undefined;
  label: ForkAgentUseCase;
  initMessages: TMessage[];
  initTitle: string | undefined;
  parentTaskId: string | undefined;
  tools: readonly ToolSpecInput[] | undefined;
  baselineStepCount: number;
};

export type StartForkAgent<TMessage extends UIMessage> = (
  agent: ForkAgent<TMessage>,
) => Promise<ForkAgentHandle> | ForkAgentHandle;

const ForkAgentUseCaseLabels: Record<ForkAgentUseCase, string> = {
  "task-memory": "Task Memory Extraction",
  "auto-memory": "Auto Memory Extraction",
  "auto-memory-dream": "Auto Memory Dream",
};

export function buildForkAgentInitTitle(
  useCase: ForkAgentUseCase,
  parentTaskTitle?: string,
): string {
  const useCaseLabel = ForkAgentUseCaseLabels[useCase];
  const parent = parentTaskTitle?.trim();
  return parent ? `[${useCaseLabel}] ${parent}` : `[${useCaseLabel}]`;
}

function buildForkMessages<TMessage extends UIMessage>(
  parentMessages: readonly TMessage[],
  directive: string,
): TMessage[] {
  return [
    ...parentMessages.map((message) => ({
      ...structuredClone(message),
      id: crypto.randomUUID(),
    })),
    {
      id: crypto.randomUUID(),
      role: "user",
      parts: [{ type: "text", text: directive }],
    } as TMessage,
  ];
}

function countStepStarts(
  messages: ReadonlyArray<Pick<UIMessage, "parts">>,
): number {
  return messages
    .flatMap((message) => message.parts)
    .filter((part) => part.type === "step-start").length;
}

export function createForkAgent<TMessage extends UIMessage>(
  input: ForkAgentInput<TMessage>,
): ForkAgent<TMessage> {
  const initMessages = buildForkMessages(input.parentMessages, input.directive);
  const baselineStepCount = countStepStarts(input.parentMessages);
  const tools = input.tools ? ensureAttemptCompletion(input.tools) : undefined;

  logger.debug(
    {
      label: input.label,
      initTitle: input.initTitle,
      parentTaskId: input.parentTaskId,
      parentCwd: input.parentCwd,
      parentMessages: input.parentMessages.length,
      initMessages: initMessages.length,
      tools: input.tools?.length,
      baselineStepCount,
    },
    "Creating fork agent",
  );

  return {
    cwd: input.parentCwd,
    label: input.label,
    initMessages,
    initTitle: input.initTitle,
    parentTaskId: input.parentTaskId,
    tools,
    baselineStepCount,
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
