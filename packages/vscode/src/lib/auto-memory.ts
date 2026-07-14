import type {
  AutoMemoryDreamCandidate,
  AutoMemoryManager as AutoMemoryManagerContract,
  AutoMemoryReadContextOptions,
} from "@getpochi/common";
import { AutoMemoryManager as BaseAutoMemoryManager } from "@getpochi/common/auto-memory/node";
import { Lifecycle, injectable, scoped } from "tsyringe";
// biome-ignore lint/style/useImportType: needed for dependency injection
import { PochiConfiguration } from "../integrations/configuration";
// biome-ignore lint/style/useImportType: needed for dependency injection
import { TaskHistoryStore } from "./task-history-store";
// biome-ignore lint/style/useImportType: needed for dependency injection
import { WorkspaceScope } from "./workspace-scoped";

@injectable()
@scoped(Lifecycle.ContainerScoped)
export class AutoMemoryManager extends BaseAutoMemoryManager {
  constructor(
    private readonly pochiConfiguration: PochiConfiguration,
    private readonly workspaceScope: WorkspaceScope,
    private readonly taskHistoryStore: TaskHistoryStore,
  ) {
    super();
  }

  readHostApi(): AutoMemoryManagerContract {
    return {
      readContext: (cwdOrOptions) => this.readHostContext(cwdOrOptions),
      writeTaskTranscript: (options) => this.writeHostTaskTranscript(options),
      beginDreamRun: (options) => this.beginHostDreamRun(options),
      finishDreamRun: (options) => this.finishDreamRun(options),
      clearProjectMemory: (options) =>
        this.clearProjectMemory({ cwd: options?.cwd ?? this.cwd }),
    };
  }

  private get cwd() {
    return this.workspaceScope.cwd ?? undefined;
  }

  private isEnabled() {
    return (
      this.pochiConfiguration.advancedSettings.value.memory?.enabled !== false
    );
  }

  async readHostContext(cwdOrOptions?: string | AutoMemoryReadContextOptions) {
    const options =
      typeof cwdOrOptions === "string" ? { cwd: cwdOrOptions } : cwdOrOptions;
    if (!options?.force && !this.isEnabled()) return undefined;
    return this.readContext(options?.cwd ?? this.cwd, {
      ensure: options?.ensure,
    });
  }

  async writeHostTaskTranscript(options: {
    taskId: string;
    cwd?: string;
    title?: string;
    updatedAt?: number;
    transcript: string;
  }) {
    // Extraction keeps running even when injection is disabled, so this is
    // intentionally not gated by the Project Memory enabled preference.
    return this.writeTaskTranscript({
      taskId: options.taskId,
      cwd: options.cwd ?? this.cwd,
      title: options.title,
      updatedAt: options.updatedAt,
      transcript: options.transcript,
    });
  }

  async beginHostDreamRun(options: {
    cwd?: string;
    candidates?: readonly AutoMemoryDreamCandidate[];
    sessionUpdatedAts?: readonly number[];
    currentTranscript?: AutoMemoryDreamCandidate;
  }) {
    // Dreaming is part of extraction and keeps running even when injection is
    // disabled, so it is intentionally not gated by the enabled preference.
    const cwd = options.cwd ?? this.cwd;
    const candidates = [
      ...(await this.collectDreamCandidates(cwd)),
      ...(options.candidates ?? []),
    ];
    const mergedCandidates = mergeDreamCandidates(
      candidates,
      options.currentTranscript,
    );

    return this.beginDreamRun({
      cwd,
      candidates: mergedCandidates,
      sessionUpdatedAts: mergedCandidates.map((task) => task.updatedAt),
    });
  }

  private async collectDreamCandidates(
    cwd: string | undefined,
  ): Promise<AutoMemoryDreamCandidate[]> {
    const baseContext = await this.readContext(cwd, { ensure: false });
    if (!baseContext) return [];

    const result: AutoMemoryDreamCandidate[] = [];
    for (const task of Object.values(this.taskHistoryStore.tasks.value)) {
      if (!task.id || task.parentId) continue;

      const taskCwd = task.cwd ?? cwd;
      if (!taskCwd) continue;

      const taskContext = await this.readContext(taskCwd, {
        ensure: false,
      }).catch(() => undefined);
      if (taskContext?.repoKey !== baseContext.repoKey) continue;

      result.push({
        taskId: task.id,
        cwd: task.cwd,
        updatedAt: task.updatedAt ?? 0,
        transcriptFilename: `${task.id}.md`,
        title: task.title ?? undefined,
      });
    }

    return result;
  }
}

function mergeDreamCandidates(
  candidates: readonly AutoMemoryDreamCandidate[],
  currentTranscript: AutoMemoryDreamCandidate | undefined,
) {
  const merged = new Map<string, AutoMemoryDreamCandidate>();
  for (const candidate of candidates) {
    merged.set(candidate.taskId, candidate);
  }
  if (currentTranscript) {
    merged.set(currentTranscript.taskId, currentTranscript);
  }
  return [...merged.values()];
}
