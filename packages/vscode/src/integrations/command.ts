import {
  applyQuickFixes,
  calcEditedRangeAfterAccept,
} from "@/code-completion/auto-code-actions";
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
import { NESDecorationManager } from "@/nes/decoration-manager";
import type { WebsiteTaskCreateEvent } from "@getpochi/common";
import {
  type CustomModelSetting,
  type McpServerConfig,
  pochiConfig,
} from "@getpochi/common/configuration";
// biome-ignore lint/style/useImportType: needed for dependency injection
import { McpHub } from "@getpochi/common/mcp-utils";
import { getVendor } from "@getpochi/common/vendor";
import type {
  NewTaskParams,
  TaskIdParams,
} from "@getpochi/common/vscode-webui-bridge";
import { getServerBaseUrl } from "@getpochi/common/vscode-webui-bridge";
import { inject, injectable, singleton } from "tsyringe";
import * as vscode from "vscode";
// biome-ignore lint/style/useImportType: needed for dependency injection
import { PochiConfiguration } from "./configuration";
import { DiffChangesContentProvider } from "./editor/diff-changes-content-provider";
// biome-ignore lint/style/useImportType: needed for dependency injection
import { GitWorktreeInfoProvider } from "./git/git-worktree-info-provider";
// biome-ignore lint/style/useImportType: needed for dependency injection
import { WorktreeManager } from "./git/worktree";
import {
  applyPochiLayout,
  getSortedCurrentTabGroups,
  getViewColumnForTerminal,
  isCurrentLayoutDerivedFromPochiLayout,
  isPochiTaskTab,
} from "./layout";
import { PochiTaskEditorProvider } from "./webview/webview-panel";
const logger = getLogger("CommandManager");

@injectable()
@singleton()
export class CommandManager implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];

  constructor(
    private readonly pochiWebviewSidebar: PochiWebviewSidebar,
    private readonly newProjectRegistry: NewProjectRegistry,
    @inject("AuthClient") private readonly authClient: AuthClient,
    private readonly authEvents: AuthEvents,
    private readonly mcpHub: McpHub,
    private readonly pochiConfiguration: PochiConfiguration,
    private readonly posthog: PostHog,
    private readonly nesDecorationManager: NESDecorationManager,
    private readonly worktreeManager: WorktreeManager,
    private readonly worktreeInfoProvider: GitWorktreeInfoProvider,
  ) {
    this.registerCommands();
  }

  private async prepareProjectAndOpenTask(
    progress: vscode.Progress<{ message?: string; increment?: number }>,
    workspaceUri: vscode.Uri,
    githubTemplateUrl: string | undefined,
    openTaskParams: TaskIdParams | NewTaskParams,
    requestId?: string,
  ) {
    if (githubTemplateUrl) {
      await prepareProject(workspaceUri, githubTemplateUrl, progress);
    }

    this.openTaskOnWorkspaceFolder(openTaskParams);

    if (requestId) {
      await this.newProjectRegistry.set(requestId, workspaceUri);
    }
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
          await this.authClient.signOut();
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
          const mainWorktree = this.worktreeManager.getMainWorktree();

          if (!mainWorktree) {
            return;
          }

          // Clear the GitHub data for the main worktree
          await this.worktreeInfoProvider.updateGithubIssues(
            mainWorktree.path,
            {
              data: [],
              updatedAt: undefined,
              processedAt: undefined,
              pageOffset: undefined,
            },
          );

          // Also clear pull request data if it exists
          await this.worktreeInfoProvider.updateGithubPullRequest(
            mainWorktree.path,
            undefined,
          );

          logger.info(
            `Cleared GitHub info for main worktree: ${mainWorktree.path}`,
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
        vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            cancellable: false,
          },
          async (progress) => {
            progress.report({ message: "Pochi: Opening task..." });
            await vscode.commands.executeCommand("pochiSidebar.focus");
            this.openTaskOnWorkspaceFolder({ uid });
          },
        );
      }),

      vscode.commands.registerCommand(
        "pochi.webui.navigate.taskList",
        async () => {
          await vscode.commands.executeCommand("pochiSidebar.focus");
          const webviewHost =
            await this.pochiWebviewSidebar.retrieveWebviewHost();
          webviewHost.openTaskList();
        },
      ),

      vscode.commands.registerCommand(
        "pochi.webui.navigate.settings",
        async () => {
          await vscode.commands.executeCommand("pochiSidebar.focus");
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
          await vscode.commands.executeCommand("pochiSidebar.focus");
        }
      }),

      vscode.commands.registerCommand(
        "pochi.inlineCompletion.onDidAccept",
        async (item: vscode.InlineCompletionItem) => {
          this.posthog.capture("acceptCodeCompletion");

          // Apply auto-import quick fixes after code completion is accepted
          const editor = vscode.window.activeTextEditor;
          if (editor) {
            const editedRange = calcEditedRangeAfterAccept(item);
            await vscode.commands.executeCommand(
              "editor.action.inlineSuggest.commit",
            );
            if (editedRange) {
              applyQuickFixes(editor.document.uri, editedRange);
            }
          }
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

      vscode.commands.registerCommand("pochi.openFileFromDiff", async () => {
        const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab;
        logger.debug("openFileFromDiff", { activeTab });
        if (
          activeTab &&
          activeTab.input instanceof vscode.TabInputTextDiff &&
          activeTab.input.original.scheme === DiffChangesContentProvider.scheme
        ) {
          const data = DiffChangesContentProvider.parse(
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
            cwd,
          });
        },
      ),

      vscode.commands.registerCommand(
        "pochi.tabCompletion.accept",
        async () => {
          this.nesDecorationManager.accept();
        },
      ),

      vscode.commands.registerCommand(
        "pochi.tabCompletion.reject",
        async () => {
          this.nesDecorationManager.reject();
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
        const params = taskUri
          ? PochiTaskEditorProvider.parseTaskUri(taskUri)
          : undefined;
        const viewColumn = getViewColumnForTerminal();
        const location = viewColumn ? { viewColumn } : undefined;
        vscode.window.createTerminal({ cwd: params?.cwd, location }).show();
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
            vscode.window
              .createTerminal({ cwd: worktreePath, location })
              .show();
          }
        },
      ),

      vscode.commands.registerCommand(
        "pochi.worktree.newTask",
        async (worktreePath: string) => {
          if (worktreePath) {
            PochiTaskEditorProvider.openTaskEditor({
              cwd: worktreePath,
            });
          }
        },
      ),

      vscode.commands.registerCommand(
        "pochi.applyPochiLayout",
        async (...args) => {
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
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (workspaceFolders && workspaceFolders.length > 0) {
              cwd = workspaceFolders[0].uri.fsPath;
            }
          }
          await applyPochiLayout({ cwd });
        },
      ),

      vscode.commands.registerCommand(
        "pochi.openPochiLayoutOrTerminal",
        async (...args) => {
          logger.debug("openPochiLayoutOrTerminal", { args });
          // Check if Pochi layout is already applied
          if (isCurrentLayoutDerivedFromPochiLayout()) {
            vscode.commands.executeCommand("pochi.openTerminal", ...args);
          } else {
            vscode.commands.executeCommand("pochi.applyPochiLayout", ...args);
          }
        },
      ),
    );
  }

  openTaskOnWorkspaceFolder(params?: TaskIdParams | NewTaskParams) {
    const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!cwd) {
      vscode.window.showErrorMessage(
        "Cannot create Pochi task without a workspace folder.",
      );
      return;
    }
    PochiTaskEditorProvider.openTaskEditor({
      ...params,
      cwd,
    });
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

  dispose() {
    // Dispose all commands
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];
  }
}

function findActivePochiTaskTab():
  | (vscode.Tab & {
      input: vscode.TabInputCustom & {
        viewType: typeof PochiTaskEditorProvider.viewType;
      };
    })
  | undefined {
  // Try find active tab in active group
  const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab;
  if (activeTab && isPochiTaskTab(activeTab)) {
    return activeTab;
  }
  // Otherwise find active tab in other groups
  const group = getSortedCurrentTabGroups().find(
    (group) => group.activeTab && isPochiTaskTab(group.activeTab),
  );
  if (group?.activeTab && isPochiTaskTab(group.activeTab)) {
    return group.activeTab;
  }
  // Otherwise find first task tab
  const tab = getSortedCurrentTabGroups()
    .flatMap((group) => group.tabs)
    .find((tab) => isPochiTaskTab(tab));
  if (tab) {
    return tab;
  }
  return undefined;
}
