import type { AuthClient } from "@/lib/auth-client";
// biome-ignore lint/style/useImportType: needed for dependency injection
import { AuthEvents } from "@/lib/auth-events";
import { getLogger } from "@/lib/logger";
// biome-ignore lint/style/useImportType: needed for dependency injection
import { NewProjectRegistry, createNewWorkspace } from "@/lib/new-project";
// biome-ignore lint/style/useImportType: needed for dependency injection
import { WorkspaceJobQueue } from "@/lib/workspace-job";
import { WebsiteTaskCreateEvent } from "@getpochi/common";
import { inject, injectable, singleton } from "tsyringe";
import * as vscode from "vscode";

const logger = getLogger("UriHandler");

@injectable()
@singleton()
class RagdollUriHandler implements vscode.UriHandler, vscode.Disposable {
  constructor(
    @inject("AuthClient")
    private readonly authClient: AuthClient,
    private readonly workspaceJobQueue: WorkspaceJobQueue,
    private readonly newProjectRegistry: NewProjectRegistry,
    private readonly authEvents: AuthEvents,
  ) {}

  private registeration = vscode.window.registerUriHandler(this);
  dispose() {
    this.registeration.dispose();
  }

  handleUri(uri: vscode.Uri): vscode.ProviderResult<void> {
    logger.debug("handleUri", uri.toString());
    this.handleUriImpl(uri);
  }

  private async handleUriImpl(uri: vscode.Uri) {
    await vscode.commands.executeCommand("pochiWebui.focus");

    /**
     * Supported URI formats:
     * - vscode://tabbyml.pochi/?token=<device_link_token> - Device link authentication
     * - vscode://tabbyml.pochi/?task=<task_uid> - Open an existing task
     * - vscode://tabbyml.pochi/?event=<encoded_WebsiteTaskCreateEvent> - Create a new project with task
     */
    const searchParams = new URLSearchParams(uri.query);
    const token = searchParams.get("token");
    if (token) {
      await this.loginWithDeviceLink(token);
      return;
    }

    // Handle URI parameters
    const taskParam = searchParams.get("task");
    const eventParam = searchParams.get("event");

    if (taskParam) {
      await this.safeExecute(
        () => this.handleOpenTask(taskParam),
        "Failed to open task",
      );
    } else if (eventParam) {
      await this.safeExecute(() => {
        const decodedEvent = JSON.parse(decodeURIComponent(eventParam));
        const event = WebsiteTaskCreateEvent.parse(decodedEvent);
        return this.handleNewProjectTask(event);
      }, "Failed to process task event");
    }
  }

  private async safeExecute<T>(
    fn: () => T | Promise<T>,
    errorMessage: string,
  ): Promise<void> {
    try {
      await fn();
    } catch (error) {
      logger.error(errorMessage, error);
      vscode.window.showErrorMessage(errorMessage);
    }
  }

  /**
   * Opens an existing project and task if found in registry
   * @returns true if project was found and opened, false otherwise
   */
  private async openExistingProject(uid: string): Promise<boolean> {
    const existingProject = this.newProjectRegistry.get(uid);

    if (!existingProject) {
      return false;
    }

    logger.info(`Found existing project for uid ${uid}: ${existingProject}`);

    // Push job to open the task after workspace opens
    await this.workspaceJobQueue.push({
      workspaceUri: existingProject.toString(),
      command: "pochi.openTask",
      args: [uid],
      expiresAt: Date.now() + 1000 * 60,
    });

    logger.info(
      `Pushed openTask job for existing workspace: ${existingProject} with task ID: ${uid}`,
    );

    // Open the workspace, only open in newWindow when there is a existed workspace
    // In Remote Pochi, There is no opened workspace, opening new window would cause a new tab.
    const forceNewWindow =
      vscode.workspace.workspaceFolders &&
      vscode.workspace.workspaceFolders.length > 0;
    await vscode.commands.executeCommand("vscode.openFolder", existingProject, {
      forceNewWindow,
    });
    logger.info("Successfully opened existing project folder");

    return true;
  }

  private async handleOpenTask(uid: string) {
    logger.info(`Handling open task request for uid: ${uid}`);

    // Try to open existing project
    const opened = await this.openExistingProject(uid);

    if (!opened) {
      logger.info(
        `No existing project found for task ${uid}, opening task in current workspace`,
      );
      await vscode.commands.executeCommand("pochi.openTask", uid);
    }
  }

  private async handleNewProjectTask(event: WebsiteTaskCreateEvent) {
    const { data: params } = event;
    const { uid, name } = params;

    logger.info(`Handling new project task: ${JSON.stringify(params)}`);

    // Check if project already exists
    if (uid && (await this.openExistingProject(uid))) {
      return;
    }

    // In remote environments, check if we're already in the target workspace
    // Minion already created the workspace, so we did not need to create a new one in remote pochi
    const isRemoteEnv = !!process.env.POCHI_REMOTE_ENV;
    const currentWorkspace = vscode.workspace.workspaceFolders?.[0]?.uri;
    if (isRemoteEnv && currentWorkspace) {
      logger.info(
        "Already in target workspace, executing createProject directly",
      );

      // Execute the command directly instead of queueing it
      await vscode.commands.executeCommand("pochi.createProject", event);
      return;
    }

    const newWorkspaceUri = await createNewWorkspace(name);
    if (!newWorkspaceUri) {
      vscode.window.showWarningMessage("Cancelled creating new project.");
      return;
    }
    logger.info(
      `created workspace: ${newWorkspaceUri}, current workspace: ${vscode.workspace.workspaceFolders?.[0]?.uri}, POCHI_MINION_ID: ${process.env.POCHI_MINION_ID}`,
    );

    // push a global job to create task after the new workspace is opened
    await this.workspaceJobQueue.push({
      workspaceUri: newWorkspaceUri.toString(),
      command: "pochi.createProject",
      args: [event],
      expiresAt: Date.now() + 1000 * 60,
    });

    logger.info(`Pushed job to queue for workspace: ${newWorkspaceUri}`);

    // open the new workspace
    // TODO(sma1lboy): remove this, just test to see if it works
    try {
      logger.info("Attempting to open workspace folder...");
      await vscode.commands.executeCommand(
        "vscode.openFolder",
        newWorkspaceUri,
        {
          forceReuseWindow: true,
        },
      );
      logger.info("vscode.openFolder command completed");
    } catch (error) {
      logger.error("Failed to open workspace folder", error);

      // If opening folder fails in remote env, try to execute the command directly
      if (isRemoteEnv) {
        logger.info(
          "Attempting to execute createProject directly after folder open failure",
        );
        await vscode.commands.executeCommand("pochi.createProject", event);
      }
    }
  }

  private async loginWithDeviceLink(token: string) {
    vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        cancellable: false,
      },
      async (progress) => {
        progress.report({ message: "Login in progress, please wait..." });

        const { data, error } = await this.authClient.deviceLink.verify({
          query: { token },
        });

        if (error || "error" in data) {
          vscode.window.showErrorMessage("Failed to login, please try again.");
          return;
        }

        this.authEvents.loginEvent.fire();
      },
    );
  }
}

export default RagdollUriHandler;
