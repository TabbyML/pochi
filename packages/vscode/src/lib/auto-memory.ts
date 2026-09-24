import type {
  AutoMemoryManager as AutoMemoryManagerContract,
  AutoMemoryReadContextOptions,
} from "@getpochi/common";
import { AutoMemoryManager as BaseAutoMemoryManager } from "@getpochi/common/auto-memory/node";
import { Lifecycle, injectable, scoped } from "tsyringe";
// biome-ignore lint/style/useImportType: needed for dependency injection
import { PochiConfiguration } from "../integrations/configuration";
// biome-ignore lint/style/useImportType: needed for dependency injection
import { WorkspaceScope } from "./workspace-scoped";

@injectable()
@scoped(Lifecycle.ContainerScoped)
export class AutoMemoryManager extends BaseAutoMemoryManager {
  constructor(
    private readonly pochiConfiguration: PochiConfiguration,
    private readonly workspaceScope: WorkspaceScope,
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
    currentTaskId?: string;
  }) {
    // Dreaming is part of extraction and keeps running even when injection is
    // disabled, so it is intentionally not gated by the enabled preference.
    const cwd = options.cwd ?? this.cwd;
    return this.beginDreamRun({
      cwd,
      currentTaskId: options.currentTaskId,
    });
  }
}
