import { spawn } from "node:child_process";
import { inject, injectable, singleton } from "tsyringe";
import * as vscode from "vscode";
import { getLogger } from "./logger";

const logger = getLogger("PostInstallActions");

@singleton()
@injectable()
export class PostInstallActions {
  private actions: Action[] = [];

  constructor(
    @inject("vscode.ExtensionContext") private context: vscode.ExtensionContext,
  ) {
    this.actions.push(new SetRemoteDefaultExtensionAction(this.context));

    false && this.actions.push(new OpenTaskFromEnvAction());

    this.actions.push(new KillRunnerProcessAction());

    this.runActions();
  }

  private async runActions(): Promise<void> {
    for (const action of this.actions) {
      if (!this.isActionCompleted(action.id)) {
        try {
          await action.execute();
          await this.markActionCompleted(action.id);
        } catch (error) {
          logger.error(
            `Failed to execute post-install action ${action.id}:`,
            error,
          );
        }
      }
    }
  }

  private isActionCompleted(actionId: string): boolean {
    return this.context.globalState.get<boolean>(
      this.getActionKey(actionId),
      false,
    );
  }

  private async markActionCompleted(actionId: string): Promise<void> {
    await this.context.globalState.update(this.getActionKey(actionId), true);
  }

  private getActionKey(actionId: string): string {
    return `post_install_action.${actionId}`;
  }
}

interface Action {
  id: string;
  execute(): Promise<void>;
}

class SetRemoteDefaultExtensionAction implements Action {
  id = "set_remote_default_extension";

  constructor(private context: vscode.ExtensionContext) {}

  async execute(): Promise<void> {
    const extensionId = this.context.extension.id;
    const config = vscode.workspace.getConfiguration("remote");
    const currentValue: string[] =
      config.get("defaultExtensionsIfInstalledLocally") || [];

    if (!currentValue.includes(extensionId)) {
      await config.update(
        "defaultExtensionsIfInstalledLocally",
        [...currentValue, extensionId],
        vscode.ConfigurationTarget.Global,
      );

      logger.info(
        `Added ${extensionId} to remote.defaultExtensionsIfInstalledLocally`,
      );
    }
  }
}

class OpenTaskFromEnvAction implements Action {
  id = "open_task_from_env";

  async execute(): Promise<void> {
    const uid = process.env.POCHI_TASK_ID;
    if (uid) {
      logger.info(`Opening task from POCHI_TASK_ID: ${uid}`);
      await vscode.commands.executeCommand("pochiSidebar.focus");
      await new Promise((resolve) => setTimeout(resolve, 500));
      await vscode.commands.executeCommand("pochi.openTask", uid);
    }
  }
}

class KillRunnerProcessAction implements Action {
  id = "kill_runner_process";

  async execute(): Promise<void> {
    try {
      await killRunnerProcess();
    } catch (error) {
      logger.error(
        `Failed to kill pochi-runner processes: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

/**
 * kill all pochi-runner processes before extension start on sandbox containers.
 */
const killRunnerProcess = async () => {
  // check if is running in a container
  if (!process.env.POCHI_SANDBOX_HOST) {
    logger.info(
      "This script is intended to be run inside a container. Skipping process kill.",
    );
    return;
  }

  return new Promise<void>((resolve, reject) => {
    const pkill = spawn("pkill", ["-f", "pochi-runner"]);

    pkill.on("close", (code, signal) => {
      if (code === 0) {
        logger.info("Successfully killed pochi-runner processes");
        resolve();
      } else if (code === 1) {
        logger.info("No pochi-runner processes found to kill");
        resolve();
      } else {
        logger.error(`pkill failed with code: ${code}, signal: ${signal}`);
        reject(new Error(`pkill failed: ${code}`));
      }
    });

    pkill.on("error", (error) => {
      logger.error(`Failed to start pkill: ${error.message}`);
      reject(error);
    });
  });
};
