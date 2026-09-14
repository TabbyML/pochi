export type BackgroundJobId =
  | `bgjob-cmd-${string}`
  | `bgjob-monitor-${string}`
  | `bgjob-task-${string}`
  | `term-${string}`;

const prefixes = {
  command: "bgjob-cmd-",
  monitor: "bgjob-monitor-",
  task: "bgjob-task-",
  terminal: "term-",
} as const;

export type BackgroundJobIdType = keyof typeof prefixes;

export function createBackgroundJobId(
  type: BackgroundJobIdType,
): BackgroundJobId {
  return `${prefixes[type]}${crypto.randomUUID()}`;
}

/** Classifies IDs by their existing prefix convention. */
export function parseBackgroundJobId(
  id: string,
): BackgroundJobIdType | undefined {
  for (const type of Object.keys(prefixes) as BackgroundJobIdType[]) {
    if (id.startsWith(prefixes[type])) return type;
  }
  return undefined;
}

export function getSubAgentBackgroundJobId(taskId: string): BackgroundJobId {
  return `${prefixes.task}${taskId}`;
}

export function getSubAgentTaskId(backgroundJobId: string): string | undefined {
  if (parseBackgroundJobId(backgroundJobId) !== "task") return undefined;
  return backgroundJobId.slice(prefixes.task.length) || undefined;
}
