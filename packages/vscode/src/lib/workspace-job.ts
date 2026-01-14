import { getLogger } from "@/lib/logger";
import { inject, injectable, singleton } from "tsyringe";
import * as vscode from "vscode";
// biome-ignore lint/style/useImportType: needed for dependency injection
import { WorkspaceScope } from "./workspace-scoped";

export interface WorkspaceJob {
  // should get from vscode.Uri.fsPath
  workspaceUri: string;

  // registered command id
  command: string;

  // command args
  args: unknown[];

  // Runner check job every 1000ms, job will not be executed if it is expired
  expiresAt: number;
}

const logger = getLogger("WorkspaceJobQueue");

@injectable()
@singleton()
export class WorkspaceJobQueue implements vscode.Disposable {
  private static readonly GlobalStateKey = "global_jobs";

  private readonly runner = setInterval(async () => {
    await this.run();
  }, 1000);

  constructor(
    private readonly workspaceScope: WorkspaceScope,
    @inject("vscode.ExtensionContext")
    private readonly context: vscode.ExtensionContext,
  ) {}

  async push(job: WorkspaceJob): Promise<void> {
    const commands = this.context.globalState.get<WorkspaceJob[]>(
      WorkspaceJobQueue.GlobalStateKey,
      [],
    );
    commands.push(job);
    logger.debug(`Pushing job ${JSON.stringify(job)}`);
    await this.context.globalState.update(
      WorkspaceJobQueue.GlobalStateKey,
      commands,
    );
  }

  get currentWorkspaceUri() {
    return this.workspaceScope.workspaceUri;
  }

  private async run() {
    const allJobs = this.context.globalState.get<WorkspaceJob[]>(
      WorkspaceJobQueue.GlobalStateKey,
      [],
    );

    if (allJobs.length === 0) {
      return;
    }

    logger.trace(`Running workspace job queue with ${allJobs.length} jobs.`);

    const currentWorkspaceJobs: WorkspaceJob[] = [];
    const remainingJobs: WorkspaceJob[] = [];
    const now = Date.now();
    const currentWorkspaceFsPath = this.currentWorkspaceUri?.fsPath;

    for (const job of allJobs) {
      if (job.expiresAt <= now) {
        logger.debug(`Job ${JSON.stringify(job)} expired.`);
        // Expired jobs are ignored and not added to remainingJobs or currentWorkspaceJobs
      } else if (job.workspaceUri === currentWorkspaceFsPath) {
        currentWorkspaceJobs.push(job);
      } else {
        remainingJobs.push(job);
      }
    }

    // Update global state with remaining jobs (those not expired and not for the current workspace)
    await this.context.globalState.update(
      WorkspaceJobQueue.GlobalStateKey,
      remainingJobs,
    );

    // Run the current workspace jobs
    for (const job of currentWorkspaceJobs) {
      logger.debug(`Running job ${JSON.stringify(job)}.`);
      await vscode.commands.executeCommand(job.command, ...job.args);
    }
  }

  dispose() {
    clearInterval(this.runner);
  }
}
