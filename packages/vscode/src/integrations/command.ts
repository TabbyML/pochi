// biome-ignore lint/style/useImportType: needed for dependency injection
import { PochiWebviewSidebar } from "@/integrations/webview";
import type { AuthClient } from "@/lib/auth-client";
// biome-ignore lint/style/useImportType: needed for dependency injection
import { AuthEvents } from "@/lib/auth-events";
import { getWorkspaceRulesFileUri } from "@/lib/env";
import { getLogger, showOutputPanel } from "@/lib/logger";
// biome-ignore lint/style/useImportType: needed for dependency injection
import { NewProjectRegistry, prepareProject } from "@/lib/new-project";
// biome-ignore lint/style/useImportType: needed for dependency injection
import { PostHog } from "@/lib/posthog";
// biome-ignore lint/style/useImportType: needed for dependency injection
import { WorkspaceScope } from "@/lib/workspace-scoped";
// biome-ignore lint/style/useImportType: needed for dependency injection
import {
  type OnDidAcceptInlineCompletionItemParams,
  TabCompletionManager,
} from "@/tab-completion";
import type { WebsiteTaskCreateEvent } from "@getpochi/common";
import {
  type CustomModelSetting,
  type McpServerConfig,
  pochiConfig,
  updateVendorConfig,
} from "@getpochi/common/configuration";
// biome-ignore lint/style/useImportType: needed for dependency injection
import { McpHub } from "@getpochi/common/mcp-utils";
import { getVendor } from "@getpochi/common/vendor";
import type { PochiTaskParams } from "@getpochi/common/vscode-webui-bridge";
import { getServerBaseUrl } from "@getpochi/common/vscode-webui-bridge";
import { inject, injectable, singleton } from "tsyringe";
import * as vscode from "vscode";
// biome-ignore lint/style/useImportType: needed for dependency injection
import { type PochiAdvanceSettings, PochiConfiguration } from "./configuration";
import { DiffChangesContentProvider } from "./editor/diff-changes-content-provider";
// biome-ignore lint/style/useImportType: needed for dependency injection
import { GitWorktreeInfoProvider } from "./git/git-worktree-info-provider";
import { getMainWorktreePath } from "./git/util";
// biome-ignore lint/style/useImportType: needed for dependency injection
import { WorktreeManager } from "./git/worktree";
// biome-ignore lint/style/useImportType: needed for dependency injection
import {
  LayoutManager,
  createTerminal,
  findActivePochiTaskTab,
  getViewColumnForTerminal,
} from "./layout";
// biome-ignore lint/style/useImportType: needed for dependency injection
import {
  type Comment,
  ReviewController,
  type Thread,
} from "./review-controller";
import { PochiTaskEditorProvider } from "./webview/webview-panel";

const logger = getLogger("CommandManager");

@injectable()
@singleton()
export class CommandManager implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];

  constructor(
    private readonly workspaceScope: WorkspaceScope,
    private readonly pochiWebviewSidebar: PochiWebviewSidebar,
    private readonly newProjectRegistry: NewProjectRegistry,
    @inject("AuthClient") private readonly authClient: AuthClient,
    private readonly authEvents: AuthEvents,
    private readonly mcpHub: McpHub,
    private readonly pochiConfiguration: PochiConfiguration,
    private readonly posthog: PostHog,
    private readonly tabCompletionManager: TabCompletionManager,
    private readonly worktreeManager: WorktreeManager,
    private readonly worktreeInfoProvider: GitWorktreeInfoProvider,
    private readonly reviewController: ReviewController,
    private readonly layoutManager: LayoutManager,
  ) {
    this.registerCommands();
  }

  private async prepareProjectAndOpenTask(
    progress: vscode.Progress<{ message?: string; increment?: number }>,
    workspaceUri: vscode.Uri,
    githubTemplateUrl: string | undefined,
    openTaskParams: PochiTaskParams,
    requestId?: string,
  ) {
    if (githubTemplateUrl) {
      await prepareProject(workspaceUri, githubTemplateUrl, progress);
    }

    PochiTaskEditorProvider.openTaskEditor(openTaskParams);

    if (requestId) {
      await this.newProjectRegistry.set(requestId, workspaceUri);
    }
  }

  private async focusSidebar(): Promise<void> {
    const viewType = this.pochiWebviewSidebar.getSiderbarViewType();
    await vscode.commands.executeCommand(`${viewType}.focus`);
  }

  private registerCommands() {
    this.disposables.push(
      vscode.commands.registerCommand("pochi.openLoginPage", async () => {
        vscode.env.openExternal(
          vscode.Uri.parse(
            `${getServerBaseUrl()}/auth/vscode-link?uriScheme=${vscode.env.uriScheme}`,
          ),
        );
      }),

      vscode.commands.registerCommand(
        "pochi.openWebsite",
        async (path: string) => {
          vscode.env.openExternal(vscode.Uri.parse(getServerBaseUrl() + path));
        },
      ),

      vscode.commands.registerCommand("pochi.logout", async () => {
        const selection = await vscode.window.showInformationMessage(
          "Are you sure you want to logout?",
          { modal: true },
          "Logout",
        );
        if (selection === "Logout") {
          this.authClient.signOut();

          await getVendor("pochi").logout();
          this.authEvents.logoutEvent.fire();
        }
      }),

      vscode.commands.registerCommand("pochi.loginWithToken", async () => {
        const token = await vscode.window.showInputBox({
          prompt: "Enter your login token from the Pochi website",
          placeHolder: "Paste your token here",
          ignoreFocusOut: true,
          password: true,
        });
        if (token) {
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
                vscode.window.showErrorMessage(
                  "Failed to login, please try again.",
                );
                return;
              }

              this.authEvents.loginEvent.fire();
            },
          );
        }
      }),

      vscode.commands.registerCommand("pochi.loginWithTabby", async () => {
        const urlInput = await vscode.window.showInputBox({
          prompt: "Enter Tabby Server URL",
          placeHolder: "http://localhost:8080",
          ignoreFocusOut: true,
          value: "http://localhost:8080",
        });
        if (!urlInput) return;

        const url = urlInput.trim().replace(/\/$/, "");

        const token = await vscode.window.showInputBox({
          prompt: "Enter Tabby Token",
          placeHolder: "Paste your Tabby token here",
          ignoreFocusOut: true,
          password: true,
        });
        if (token === undefined) return;

        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            cancellable: false,
          },
          async (progress) => {
            progress.report({
              message: "Logging in to Tabby, please wait...",
            });

            try {
              await updateVendorConfig("tabby", {
                credentials: { url, token: token.trim() },
              });

              const vendor = getVendor("tabby");
              const user = await vendor.getUserInfo();

              vscode.window.showInformationMessage(
                `Logged in to Tabby${user?.name ? ` as ${user.name}` : ""}.`,
              );
            } catch (error) {
              logger.error("Failed to login to Tabby", error);
              vscode.window.showErrorMessage(
                `Failed to login to Tabby: ${error instanceof Error ? error.message : String(error)}`,
              );
            }
          },
        );
      }),

      vscode.commands.registerCommand(
        "pochi.editWorkspaceRules",
        async (cwd: string) => {
          try {
            const workspaceRulesUri = getWorkspaceRulesFileUri(cwd);
            let textDocument: vscode.TextDocument;

            try {
              textDocument =
                await vscode.workspace.openTextDocument(workspaceRulesUri);
            } catch (error) {
              const fileContent =
                "<!-- Add your custom workspace rules here -->";
              await vscode.workspace.fs.writeFile(
                workspaceRulesUri,
                Buffer.from(fileContent, "utf8"),
              );
              textDocument =
                await vscode.workspace.openTextDocument(workspaceRulesUri);
            }

            await vscode.window.showTextDocument(textDocument);
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : "Unknown error";
            vscode.window.showErrorMessage(
              `Pochi: Failed to open workspace rules. ${errorMessage}`,
            );
          }
        },
      ),

      vscode.commands.registerCommand(
        "pochi.createProject",
        async (event: WebsiteTaskCreateEvent, cwd: string) => {
          const params = event.data;
          return vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              cancellable: false,
            },
            async (progress) => {
              try {
                progress.report({ message: "Pochi: Creating project..." });
                await this.prepareProjectAndOpenTask(
                  progress,
                  vscode.Uri.parse(cwd),
                  params.githubTemplateUrl,
                  {
                    cwd,
                    type: "new-task",
                    uid: params.uid,
                    prompt: params.prompt,
                    files: params.attachments?.map((attachment) => ({
                      contentType: attachment.contentType || "file",
                      name: attachment.name || "",
                      url: attachment.url,
                    })),
                  },
                  params.uid,
                );
              } catch (error) {
                const errorMessage =
                  error instanceof Error ? error.message : "Unknown error";
                vscode.window.showErrorMessage(
                  `Pochi: Failed to create project. ${errorMessage}`,
                );
              }
            },
          );
        },
      ),

      vscode.commands.registerCommand("pochi.clearGithubInfo", async () => {
        try {
          const cwd =
            this.workspaceScope.cwd ??
            this.workspaceScope.workspacePath ??
            null;
          const mainWorktreePath = cwd ? await getMainWorktreePath(cwd) : null;

          if (!mainWorktreePath) {
            return;
          }

          // Clear the GitHub data for the main worktree
          await this.worktreeInfoProvider.updateGithubIssues(mainWorktreePath, {
            data: [],
            updatedAt: undefined,
            processedAt: undefined,
            pageOffset: undefined,
          });

          // Also clear pull request data if it exists
          await this.worktreeInfoProvider.updateGithubPullRequest(
            mainWorktreePath,
            undefined,
          );

          logger.info(
            `Cleared GitHub info for main worktree: ${mainWorktreePath}`,
          );
          vscode.window.showInformationMessage(
            "GitHub info cleared successfully",
          );
        } catch (error) {
          logger.error(`Failed to clear GitHub info: ${error}`);
          vscode.window.showErrorMessage("Failed to clear GitHub info");
        }
      }),

      vscode.commands.registerCommand("pochi.openTask", async (uid: string) => {
        const cwd = this.workspaceScope.workspacePath;
        if (!cwd) return;
        vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            cancellable: false,
          },
          async (progress) => {
            progress.report({ message: "Pochi: Opening task..." });
            await this.focusSidebar();
            PochiTaskEditorProvider.openTaskEditor({
              type: "open-task",
              uid,
              cwd,
            });
          },
        );
      }),

      vscode.commands.registerCommand(
        "pochi.showWarningMessage",
        async (message: string) => {
          vscode.window.showWarningMessage(message);
        },
      ),

      vscode.commands.registerCommand(
        "pochi.webui.navigate.taskList",
        async () => {
          await this.focusSidebar();
          const webviewHost =
            await this.pochiWebviewSidebar.retrieveWebviewHost();
          webviewHost.openTaskList();
        },
      ),

      vscode.commands.registerCommand(
        "pochi.webui.navigate.settings",
        async () => {
          await this.focusSidebar();
          const webviewHost =
            await this.pochiWebviewSidebar.retrieveWebviewHost();
          webviewHost.openSettings();
        },
      ),

      vscode.commands.registerCommand("pochi.openSettings", async () => {
        vscode.commands.executeCommand(
          "workbench.action.openSettings",
          "@ext:tabbyml.pochi",
        );
      }),

      vscode.commands.registerCommand(
        "pochi.outputPanel.focus",
        showOutputPanel,
      ),

      vscode.commands.registerCommand(
        "pochi.mcp.addServer",
        async (name?: string, recommendedServer?: McpServerConfig) => {
          await this.mcpHub.addServer(name, recommendedServer);
          await new Promise((resolve) => setTimeout(resolve, 500));
          await this.pochiConfiguration.revealConfig({
            key: "mcp",
          });
        },
      ),

      vscode.commands.registerCommand(
        "pochi.mcp.openServerSettings",
        async (serverName?: string) => {
          await this.ensureDefaultMcpServer();
          await this.pochiConfiguration.revealConfig({
            key: serverName ? `mcp.${serverName}` : "mcp",
            target: serverName ? undefined : "user",
          });
        },
      ),
      vscode.commands.registerCommand(
        "pochi.mcp.serverControl",
        async (action: string, serverName: string) => {
          switch (action) {
            case "start":
              this.mcpHub.start(serverName);
              break;
            case "stop":
              this.mcpHub.stop(serverName);
              break;
            case "restart":
              this.mcpHub.restart(serverName);
              break;
            default:
              vscode.window.showErrorMessage(
                `Unknown MCP server action: ${action}`,
              );
          }
        },
      ),

      vscode.commands.registerCommand(
        "pochi.mcp.toggleToolEnabled",
        async (serverName: string, toolName: string) => {
          this.mcpHub.toggleToolEnabled(serverName, toolName);
        },
      ),

      vscode.commands.registerCommand("pochi.toggleFocus", async () => {
        const webviewHost =
          await this.pochiWebviewSidebar.retrieveWebviewHost();
        if (await webviewHost.isFocused()) {
          logger.debug("Focused on editor");
          await vscode.commands.executeCommand(
            "workbench.action.focusActiveEditorGroup",
          );
        } else {
          logger.debug("Focused on webui");
          await this.focusSidebar();
        }
      }),

      vscode.commands.registerCommand(
        "pochi.tabCompletion.onDidAccept",
        async (params: OnDidAcceptInlineCompletionItemParams) => {
          this.posthog.capture("acceptCodeCompletion");
          this.tabCompletionManager.handleDidAcceptInlineCompletion(params);
        },
      ),

      vscode.commands.registerCommand(
        "pochi.tabCompletion.resolveConflicts",
        async () => {
          const githubCopilotCodeCompletionEnabled =
            this.pochiConfiguration.githubCopilotCodeCompletionEnabled.value;
          if (!githubCopilotCodeCompletionEnabled) {
            return;
          }
          const selection = await vscode.window.showWarningMessage(
            "Pochi Tab Completion is unavailable due to conflict with **GitHub Copilot Code Completion**. You can disable conflicting features to use Pochi Tab Completion.",
            "Disable Conflicting Features",
            "Disable Pochi Tab Completion",
          );
          if (selection === "Disable Conflicting Features") {
            this.pochiConfiguration.githubCopilotCodeCompletionEnabled.value = false;
          } else if (selection === "Disable Pochi Tab Completion") {
            vscode.commands.executeCommand(
              "pochi.tabCompletion.toggleEnabled",
              false,
            );
          }
        },
      ),

      vscode.commands.registerCommand(
        "pochi.tabCompletion.toggleEnabled",
        async (enabled?: boolean | undefined) => {
          const current = this.pochiConfiguration.advancedSettings.value;
          const disabled =
            enabled === undefined ? !current.tabCompletion?.disabled : !enabled;
          const newSettings = {
            ...current,
            tabCompletion: {
              ...current.tabCompletion,
              disabled,
            },
          };
          this.pochiConfiguration.advancedSettings.value = newSettings;
        },
      ),

      vscode.commands.registerCommand(
        "pochi.tabCompletion.toggleLanguageEnabled",
        async (language?: string | undefined) => {
          const languageId =
            language ?? vscode.window.activeTextEditor?.document.languageId;

          if (!languageId) {
            return;
          }

          const current = this.pochiConfiguration.advancedSettings.value;
          let newSettings: PochiAdvanceSettings;
          if (current.tabCompletion?.disabledLanguages?.includes(languageId)) {
            newSettings = {
              ...current,
              tabCompletion: {
                ...current.tabCompletion,
                disabledLanguages:
                  current.tabCompletion.disabledLanguages.filter(
                    (lang) => lang !== languageId,
                  ),
              },
            };
          } else {
            newSettings = {
              ...current,
              tabCompletion: {
                ...current.tabCompletion,
                disabledLanguages: [
                  ...(current.tabCompletion?.disabledLanguages ?? []),
                  languageId,
                ],
              },
            };
          }
          this.pochiConfiguration.advancedSettings.value = newSettings;
        },
      ),

      vscode.commands.registerCommand("pochi.openFileFromDiff", async () => {
        const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab;
        logger.debug("openFileFromDiff", { activeTab });
        if (
          activeTab &&
          activeTab.input instanceof vscode.TabInputTextDiff &&
          activeTab.input.original.scheme === DiffChangesContentProvider.scheme
        ) {
          const data = DiffChangesContentProvider.decode(
            activeTab.input.original,
          );
          await vscode.window.showTextDocument(
            vscode.Uri.joinPath(vscode.Uri.parse(data.cwd), data.filepath),
            {
              preview: false,
            },
          );
        }
      }),

      vscode.commands.registerCommand("pochi.newTaskPanel", async () => {
        const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab;
        logger.debug("newTaskPanel", { activeTab });
        if (
          activeTab &&
          activeTab.input instanceof vscode.TabInputCustom &&
          activeTab.input.viewType === PochiTaskEditorProvider.viewType
        ) {
          PochiTaskEditorProvider.createNewTask(activeTab.input.uri);
        }
      }),

      vscode.commands.registerCommand(
        "pochi.openCustomModelSettings",
        async () => {
          await this.ensureDefaultCustomModelSettings();
          await this.pochiConfiguration.revealConfig({
            key: "providers",
          });
        },
      ),

      vscode.commands.registerCommand(
        "pochi.createTaskInPanel",
        async (scm: vscode.SourceControl) => {
          const cwd = scm?.rootUri?.fsPath;

          if (!cwd) {
            throw new Error(
              "Cannot open Pochi panel without a workspace folder.",
            );
          }

          PochiTaskEditorProvider.openTaskEditor({
            type: "new-task",
            cwd,
          });
        },
      ),

      vscode.commands.registerCommand(
        "pochi.tabCompletion.accept",
        async () => {
          this.tabCompletionManager.accept();
        },
      ),

      vscode.commands.registerCommand(
        "pochi.tabCompletion.reject",
        async () => {
          this.tabCompletionManager.reject();
        },
      ),

      vscode.commands.registerCommand("pochi.openTerminal", async (...args) => {
        let taskUri: vscode.Uri | undefined = undefined;
        // Take args first
        const arg0 = args.shift();
        if (arg0 instanceof vscode.Uri) {
          taskUri = arg0;
        }
        // Try find active task tab
        if (taskUri === undefined) {
          const activeTab = findActivePochiTaskTab();
          if (activeTab) {
            taskUri = activeTab.input.uri;
          }
        }

        // Open terminal for task
        const cwd = taskUri
          ? PochiTaskEditorProvider.parseTaskUri(taskUri)?.cwd
          : undefined;

        const viewColumn = getViewColumnForTerminal();
        const location = viewColumn ? { viewColumn } : undefined;
        createTerminal({ cwd, location }).show();
      }),

      vscode.commands.registerCommand(
        "pochi.worktree.openDiff",
        async (worktreePath: string) => {
          if (worktreePath) {
            await this.worktreeManager.showWorktreeDiff(worktreePath);
          }
        },
      ),

      vscode.commands.registerCommand(
        "pochi.worktree.openTerminal",
        async (worktreePath: string) => {
          if (worktreePath) {
            const viewColumn = getViewColumnForTerminal();
            const location = viewColumn ? { viewColumn } : undefined;
            createTerminal({ cwd: worktreePath, location }).show();
          }
        },
      ),

      vscode.commands.registerCommand(
        "pochi.worktree.newTask",
        async (worktreePath: string) => {
          if (worktreePath) {
            PochiTaskEditorProvider.openTaskEditor({
              type: "new-task",
              cwd: worktreePath,
            });
          }
        },
      ),

      vscode.commands.registerCommand(
        "pochi.applyPochiLayout",
        async (...args) => {
          await this.applyPochiLayoutWithCommandArgs(false, ...args);
        },
      ),

      vscode.commands.registerCommand(
        "pochi.applyPochiLayoutWithCycleFocus",
        async (...args) => {
          await this.applyPochiLayoutWithCommandArgs(true, ...args);
        },
      ),

      vscode.commands.registerCommand(
        "pochi.comments.deleteThread",
        async (thread?: Thread) => {
          if (thread) {
            await this.reviewController.deleteThread(thread);
          }
        },
      ),

      vscode.commands.registerCommand(
        "pochi.comments.addComment",
        async (commentReply?: vscode.CommentReply | undefined) => {
          if (commentReply) {
            await this.reviewController.addComment(commentReply);
          }
        },
      ),

      vscode.commands.registerCommand(
        "pochi.comments.deleteComment",
        async (comment?: Comment, thread?: Thread) => {
          if (comment && thread) {
            await this.reviewController.deleteComment(comment, thread);
          }
        },
      ),

      vscode.commands.registerCommand(
        "pochi.comments.startEditComment",
        async (comment: Comment, thread: Thread) => {
          await this.reviewController.startEditComment(comment, thread);
        },
      ),

      vscode.commands.registerCommand(
        "pochi.comments.saveEditComment",
        async (comment: Comment) => {
          await this.reviewController.saveEditComment(comment);
        },
      ),

      vscode.commands.registerCommand(
        "pochi.comments.cancelEditComment",
        async (comment: Comment) => {
          await this.reviewController.cancelEditComment(comment);
        },
      ),
    );
  }

  private async ensureDefaultCustomModelSettings() {
    const currentSettings = pochiConfig.value.providers;

    // If there are already settings, don't add defaults
    if (currentSettings && Object.keys(currentSettings).length > 0) {
      return;
    }

    // Define default custom model settings
    const defaultSettings = {
      openai: {
        kind: "openai",
        baseURL: "https://api.openai.com/v1",
        apiKey: "your api key here",
        models: {
          "gpt-4.1": {
            name: "GPT-4.1",
          },
          "o4-mini": {
            name: "O4-Mini",
          },
        },
      },
    } satisfies Record<string, CustomModelSetting>;

    await this.pochiConfiguration.updateCustomModelSettings(defaultSettings);
    // wait for a while to ensure the settings are saved
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  private async ensureDefaultMcpServer() {
    const currentServer = pochiConfig.value.mcp;

    if (currentServer && Object.keys(currentServer).length > 0) {
      return;
    }

    const defaulMcpServer = {
      "your-mcp-server-name": {
        command: "npx",
        args: ["your mcp server command"],
      },
    } satisfies Record<string, McpServerConfig>;

    await this.pochiConfiguration.updateMcpServers(defaulMcpServer);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  private async applyPochiLayoutWithCommandArgs(
    cycleFocus: boolean,
    ...args: unknown[]
  ) {
    let cwd: string | undefined = undefined;
    // Parse args
    const arg0 = args.shift();
    if (arg0 instanceof vscode.Uri) {
      const workspace = vscode.workspace.getWorkspaceFolder(arg0);
      if (workspace) {
        cwd = workspace.uri.fsPath;
      }
    }
    // Try find active task tab
    if (!cwd) {
      const activeTab = findActivePochiTaskTab();
      if (activeTab) {
        const params = PochiTaskEditorProvider.parseTaskUri(
          activeTab.input.uri,
        );
        cwd = params?.cwd;
      }
    }
    // Use workspace
    if (!cwd) {
      const workspaceFolder = this.workspaceScope.workspacePath;
      if (workspaceFolder) {
        cwd = workspaceFolder;
      }
    }
    this.layoutManager.startApplyPochiLayout({
      cwd,
      cycleFocus,
    });
  }

  dispose() {
    // Dispose all commands
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];
  }
}
