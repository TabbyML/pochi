import {
  applyQuickFixes,
  calcEditedRangeAfterAccept,
} from "@/code-completion/auto-code-actions";
// biome-ignore lint/style/useImportType: needed for dependency injection
import { RagdollWebviewProvider } from "@/integrations/webview/ragdoll-webview-provider";
import type { AuthClient } from "@/lib/auth-client";
// biome-ignore lint/style/useImportType: needed for dependency injection
import { AuthEvents } from "@/lib/auth-events";
import { getWorkspaceRulesFileUri } from "@/lib/env";
import { getWorkspaceFolder } from "@/lib/fs";
import { getLogger, showOutputPanel } from "@/lib/logger";
// biome-ignore lint/style/useImportType: needed for dependency injection
import { NewProjectRegistry, prepareProject } from "@/lib/new-project";
// biome-ignore lint/style/useImportType: needed for dependency injection
import { PostHog } from "@/lib/posthog";
// biome-ignore lint/style/useImportType: needed for dependency injection
import { TokenStorage } from "@/lib/token-storage";
import type { WebsiteTaskCreateEvent } from "@getpochi/common";
import {
  type CustomModelSetting,
  PochiConfigFilePath,
} from "@getpochi/common/configuration";
import type { McpServerConfig } from "@getpochi/common/configuration";
import type {
  NewTaskParams,
  TaskIdParams,
} from "@getpochi/common/vscode-webui-bridge";
import { getServerBaseUrl } from "@getpochi/common/vscode-webui-bridge";
import { inject, injectable, singleton } from "tsyringe";
import * as vscode from "vscode";
// biome-ignore lint/style/useImportType: needed for dependency injection
import { type PochiAdvanceSettings, PochiConfiguration } from "./configuration";
import { DiffChangesContentProvider } from "./editor/diff-changes-content-provider";
// biome-ignore lint/style/useImportType: needed for dependency injection
import { McpHub } from "./mcp/mcp-hub";

const logger = getLogger("CommandManager");

@injectable()
@singleton()
export class CommandManager implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];

  constructor(
    private readonly ragdollWebviewProvider: RagdollWebviewProvider,
    private readonly tokenStorage: TokenStorage,
    private readonly newProjectRegistry: NewProjectRegistry,
    @inject("AuthClient") private readonly authClient: AuthClient,
    private readonly authEvents: AuthEvents,
    private readonly mcpHub: McpHub,
    private readonly pochiConfiguration: PochiConfiguration,
    private readonly posthog: PostHog,
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
    await vscode.commands.executeCommand("pochiWebui.focus");

    if (githubTemplateUrl) {
      await prepareProject(workspaceUri, githubTemplateUrl, progress);
    }

    const webviewHost = await this.ragdollWebviewProvider.retrieveWebviewHost();
    webviewHost.openTask(openTaskParams);

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
          this.authClient.signOut();
          this.tokenStorage.setToken(undefined);
          this.authEvents.logoutEvent.fire();
        }
      }),

      vscode.commands.registerCommand("pochi.editWorkspaceRules", async () => {
        try {
          const workspaceRulesUri = getWorkspaceRulesFileUri();
          let textDocument: vscode.TextDocument;

          try {
            textDocument =
              await vscode.workspace.openTextDocument(workspaceRulesUri);
          } catch (error) {
            const fileContent = "<!-- Add your custom workspace rules here -->";
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
      }),

      vscode.commands.registerCommand(
        "pochi.createProject",
        async (event: WebsiteTaskCreateEvent) => {
          const params = event.data;
          const currentWorkspace = vscode.workspace.workspaceFolders?.[0].uri;
          if (!currentWorkspace) {
            return;
          }

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
                  currentWorkspace,
                  params.githubTemplateUrl,
                  { uid: params.uid, prompt: params.prompt },
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

      vscode.commands.registerCommand("pochi.openTask", async (uid: string) => {
        vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            cancellable: false,
          },
          async (progress) => {
            progress.report({ message: "Pochi: Opening task..." });
            await vscode.commands.executeCommand("pochiWebui.focus");
            const webviewHost =
              await this.ragdollWebviewProvider.retrieveWebviewHost();
            webviewHost.openTask({ uid });
          },
        );
      }),

      vscode.commands.registerCommand(
        "pochi.webui.navigate.newTask",
        async () => {
          await vscode.commands.executeCommand("pochiWebui.focus");
          const webviewHost =
            await this.ragdollWebviewProvider.retrieveWebviewHost();
          webviewHost.openTask({ uid: undefined });
        },
      ),

      vscode.commands.registerCommand(
        "pochi.webui.navigate.taskList",
        async () => {
          await vscode.commands.executeCommand("pochiWebui.focus");
          const webviewHost =
            await this.ragdollWebviewProvider.retrieveWebviewHost();
          webviewHost.openTaskList();
        },
      ),

      vscode.commands.registerCommand(
        "pochi.webui.navigate.settings",
        async () => {
          await vscode.commands.executeCommand("pochiWebui.focus");
          const webviewHost =
            await this.ragdollWebviewProvider.retrieveWebviewHost();
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
          this.mcpHub.addServer(name, recommendedServer);
          await vscode.commands.executeCommand(
            "vscode.open",
            vscode.Uri.file(PochiConfigFilePath),
          );
        },
      ),

      vscode.commands.registerCommand(
        "pochi.mcp.openServerSettings",
        async () => {
          await vscode.commands.executeCommand(
            "vscode.open",
            vscode.Uri.file(PochiConfigFilePath),
          );
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
          await this.ragdollWebviewProvider.retrieveWebviewHost();
        if (await webviewHost.isFocused()) {
          logger.debug("Focused on editor");
          await vscode.commands.executeCommand(
            "workbench.action.focusActiveEditorGroup",
          );
        } else {
          logger.debug("Focused on webui");
          await vscode.commands.executeCommand("pochiWebui.focus");
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
        "pochi.inlineCompletion.toggleEnabled",
        async () => {
          const current = this.pochiConfiguration.advancedSettings.value;
          const newSettings = {
            ...current,
            inlineCompletion: {
              ...current.inlineCompletion,
              disabled: !current.inlineCompletion?.disabled,
            },
          };
          this.pochiConfiguration.advancedSettings.value = newSettings;
        },
      ),

      vscode.commands.registerCommand(
        "pochi.inlineCompletion.toggleLanguageEnabled",
        async (language?: string | undefined) => {
          const languageId =
            language ?? vscode.window.activeTextEditor?.document.languageId;

          if (!languageId) {
            return;
          }

          const current = this.pochiConfiguration.advancedSettings.value;
          let newSettings: PochiAdvanceSettings;
          if (
            current.inlineCompletion?.disabledLanguages?.includes(languageId)
          ) {
            newSettings = {
              ...current,
              inlineCompletion: {
                ...current.inlineCompletion,
                disabledLanguages:
                  current.inlineCompletion.disabledLanguages.filter(
                    (lang) => lang !== languageId,
                  ),
              },
            };
          } else {
            newSettings = {
              ...current,
              inlineCompletion: {
                ...current.inlineCompletion,
                disabledLanguages: [
                  ...(current.inlineCompletion?.disabledLanguages ?? []),
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
        if (
          activeTab &&
          activeTab.input instanceof vscode.TabInputTextDiff &&
          activeTab.input.original.scheme === DiffChangesContentProvider.scheme
        ) {
          const fileUri = vscode.Uri.joinPath(
            getWorkspaceFolder().uri,
            activeTab.input.original.path,
          );
          await vscode.window.showTextDocument(fileUri, {
            preview: false,
          });
        }
      }),

      vscode.commands.registerCommand(
        "pochi.openCustomModelSettings",
        async () => {
          await this.ensureDefaultCustomModelSettings();
          await vscode.commands.executeCommand(
            "vscode.open",
            vscode.Uri.file(PochiConfigFilePath),
          );
        },
      ),
    );
  }

  private async ensureDefaultCustomModelSettings() {
    const currentSettings = this.pochiConfiguration.customModelSettings.value;

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
            contextWindow: 1047576,
            maxTokens: 32768,
          },
          "o4-mini": {
            contextWindow: 200000,
            maxTokens: 100000,
          },
        },
      },
    } satisfies Record<string, CustomModelSetting>;

    await this.pochiConfiguration.updateCustomModelSettings(defaultSettings);
  }

  dispose() {
    // Dispose all commands
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];
  }
}
