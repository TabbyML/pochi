import { AuthEvents } from "@/lib/auth-events";
import { workspaceScoped } from "@/lib/workspace-scoped";
import { getLogger, toErrorMessage } from "@getpochi/common";
import {
  type NewTaskPanelParams,
  type ResourceURI,
  type TaskPanelParams,
  type VSCodeHostApi,
  getTaskDisplayTitle,
} from "@getpochi/common/vscode-webui-bridge";
import { container } from "tsyringe";
import * as vscode from "vscode";
import { PochiConfiguration } from "../configuration";
import { GitWorktreeInfoProvider } from "../git/git-worktree-info-provider";
import { WorktreeManager } from "../git/worktree";
import { getViewColumnForTask } from "../layout";
import { WebviewBase } from "./base";
import { VSCodeHostImpl } from "./vscode-host-impl";

const logger = getLogger("PochiWebviewPanel");

/**
 * EDITOR TAB WEBVIEW PANEL
 *
 * This class manages Pochi webviews that open as editor tabs/panels.
 * It uses vscode.window.createWebviewPanel to create independent tabs
 * that can be opened, closed, and moved by users.
 *
 * Key characteristics:
 * - Opens as editor tabs (like file editors)
 * - Uses session ID: "editor-{timestamp}-{counter}"
 * - Managed by VS Code's WebviewPanel system
 * - Multiple instances allowed per VS Code window
 * - Can be opened via "Open in Editor" command from sidebar
 * - Each panel has independent state and lifecycle
 */
export class PochiWebviewPanel
  extends WebviewBase
  implements vscode.Disposable
{
  private readonly panel: vscode.WebviewPanel;

  constructor(
    panel: vscode.WebviewPanel,
    sessionId: string,
    context: vscode.ExtensionContext,
    events: AuthEvents,
    pochiConfiguration: PochiConfiguration,
    vscodeHost: VSCodeHostImpl,
    taskParams: TaskPanelParams,
  ) {
    super(sessionId, context, events, pochiConfiguration, vscodeHost);
    this.panel = panel;

    // Set webview options
    this.panel.webview.options = {
      enableScripts: true,
      enableCommandUris: true,
      localResourceRoots: [this.context.extensionUri],
    };

    // Use base class methods
    this.panel.webview.html = this.getHtmlForWebview(
      this.panel.webview,
      "pane",
      taskParams,
    );
    this.setupAuthEventListeners();
    this.setupFileWatcher(taskParams.cwd);

    // Listen to panel events
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    // Create webview thread
    this.createWebviewThread(this.panel.webview);
  }

  protected getReadResourceURI(): VSCodeHostApi["readResourceURI"] {
    return async (): Promise<ResourceURI> => {
      return this.buildResourceURI(this.panel.webview);
    };
  }

  dispose(): void {
    super.dispose();
    this.panel.dispose();
  }
}

export class PochiTaskDocument implements vscode.CustomDocument {
  constructor(
    public uri: vscode.Uri,
    public params?: TaskPanelParams,
  ) {}

  dispose(): void {
    // No cleanup needed for the document itself.
  }
}

export class PochiTaskEditorProvider
  implements vscode.CustomReadonlyEditorProvider<PochiTaskDocument>
{
  static readonly viewType = "pochi.taskEditor";
  static readonly scheme = "pochi-task";

  // only use for task params caching during opening
  private static readonly taskParamsCache = new Map<string, TaskPanelParams>();

  public static register(context: vscode.ExtensionContext): vscode.Disposable {
    const provider = new PochiTaskEditorProvider(context);
    const disposables: vscode.Disposable[] = [];

    disposables.push(
      vscode.window.registerCustomEditorProvider(
        PochiTaskEditorProvider.viewType,
        provider,
        {
          webviewOptions: {
            retainContextWhenHidden: true,
          },
          supportsMultipleEditorsPerDocument: false,
        },
      ),
    );

    setAutoLockGroupsConfig();

    disposables.push(autoCleanTabGroupLock());

    return vscode.Disposable.from(...disposables);
  }

  public static createTaskUri(params: {
    cwd: string;
    uid: string;
    displayId?: number;
  }): vscode.Uri {
    const worktreeName = container
      .resolve(WorktreeManager)
      .getWorktreeDisplayName(params.cwd);
    const displayName = getTaskDisplayTitle({
      worktreeName: worktreeName ?? "main",
      displayId: params.displayId,
      uid: params.uid,
    });
    return vscode.Uri.from({
      scheme: PochiTaskEditorProvider.scheme,
      path: `/pochi/task/${displayName}`,
      query: JSON.stringify(
        params.displayId
          ? {
              cwd: params.cwd,
              uid: params.uid,
              displayId: params.displayId,
            }
          : {
              cwd: params.cwd,
              uid: params.uid,
            },
      ), // keep query string stable for identification
    });
  }

  public static async openTaskEditor(
    params: TaskPanelParams | NewTaskPanelParams,
  ) {
    try {
      const taskParams =
        "uid" in params
          ? params
          : {
              ...params,
              uid: crypto.randomUUID(),
              displayId: await getNextDisplayId(params.cwd),
            };
      const uri = PochiTaskEditorProvider.createTaskUri(taskParams);
      PochiTaskEditorProvider.taskParamsCache.set(uri.toString(), taskParams);
      await openTaskInColumn(uri);
    } catch (error) {
      const errorMessage = toErrorMessage(error);
      vscode.window.showErrorMessage(
        `Failed to open Pochi task: ${errorMessage}`,
      );
      logger.error(`Failed to open Pochi task: ${errorMessage}`, error);
    }
  }

  public static async closeTaskEditor(uri: vscode.Uri) {
    for (const group of vscode.window.tabGroups.all) {
      for (const tab of group.tabs) {
        if (
          tab.input instanceof vscode.TabInputCustom &&
          tab.input.viewType === PochiTaskEditorProvider.viewType &&
          tab.input.uri.toString() === uri.toString()
        ) {
          await vscode.window.tabGroups.close(tab);
          logger.debug(`Closed Pochi task editor: ${uri.toString()}`);
          return;
        }
      }
    }
  }

  public static parseTaskUri(
    uri: vscode.Uri,
  ): { cwd: string; uid: string } | null {
    try {
      const query = JSON.parse(decodeURIComponent(uri.query)) as {
        cwd: string;
        uid: string;
        displayId?: number;
      };

      if (!query?.cwd || !query?.uid) {
        return null;
      }

      return query;
    } catch {
      return null;
    }
  }

  public static async createNewTask(uri: vscode.Uri) {
    try {
      const query = PochiTaskEditorProvider.parseTaskUri(uri);

      if (!query?.cwd) {
        vscode.window.showErrorMessage(
          "Failed to create new Pochi task: missing parameters",
        );
        return;
      }

      // open a new panel
      await PochiTaskEditorProvider.openTaskEditor({
        cwd: query.cwd,
      });
    } catch (error) {
      const errorMessage = toErrorMessage(error);
      vscode.window.showErrorMessage(
        `Failed to create new Pochi task: ${errorMessage}`,
      );
      logger.error(`Failed to create new Pochi task: ${errorMessage}`, error);
    }
  }

  constructor(private readonly context: vscode.ExtensionContext) {}

  openCustomDocument(
    uri: vscode.Uri,
    _openContext: vscode.CustomDocumentOpenContext,
    _token: vscode.CancellationToken,
  ): PochiTaskDocument | Thenable<PochiTaskDocument> {
    const params = PochiTaskEditorProvider.taskParamsCache.get(uri.toString());
    return new PochiTaskDocument(uri, params);
  }

  async resolveCustomEditor(
    document: PochiTaskDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken,
  ): Promise<void> {
    try {
      const params = document.params;
      const uriParams = PochiTaskEditorProvider.parseTaskUri(document.uri);
      if (!uriParams) {
        throw new Error(
          `Failed to open Pochi task: invalid parameters for ${document.uri.toString()}`,
        );
      }

      await this.setupWebview(webviewPanel, {
        ...(params ?? {}),
        ...uriParams,
      });
    } catch (error) {
      const errorMessage = toErrorMessage(error);
      vscode.window.showErrorMessage(
        `Failed to open Pochi task: ${errorMessage}`,
      );
      logger.error(`Failed to open Pochi task: ${errorMessage}`, error);
    }
  }

  private async setupWebview(
    webviewPanel: vscode.WebviewPanel,
    params: TaskPanelParams,
  ): Promise<PochiWebviewPanel> {
    const cwd = params.cwd;
    const uid = params.uid;
    const workspaceContainer = workspaceScoped(cwd);

    const events = workspaceContainer.resolve(AuthEvents);
    const pochiConfiguration = workspaceContainer.resolve(PochiConfiguration);
    const vscodeHost = workspaceContainer.resolve(VSCodeHostImpl);

    webviewPanel.webview.options = {
      enableScripts: true,
      enableCommandUris: true,
      localResourceRoots: [this.context.extensionUri],
    };

    webviewPanel.iconPath = WebviewBase.getLogoIconPath(
      this.context.extensionUri,
    );

    const sessionId = `editor-${cwd}-${uid}`;

    const pochiPanel = new PochiWebviewPanel(
      webviewPanel,
      sessionId,
      this.context,
      events,
      pochiConfiguration,
      vscodeHost,
      params,
    );

    logger.debug(`Opened Pochi task editor: cwd=${cwd}, uid=${uid}`);
    return pochiPanel;
  }
}

async function getNextDisplayId(cwd: string) {
  const worktreeManager = container.resolve(WorktreeManager);
  const mainWorktreeCwd = worktreeManager.worktrees.value.find(
    (wt) => wt.isMain,
  )?.path;
  const worktreeInfoProvider = container.resolve(GitWorktreeInfoProvider);
  return await worktreeInfoProvider.getNextDisplayId(mainWorktreeCwd ?? cwd);
}

function setAutoLockGroupsConfig() {
  const autoLockGroupsConfig =
    vscode.workspace.getConfiguration("workbench.editor");

  const result =
    autoLockGroupsConfig.inspect<Record<string, boolean>>("autoLockGroups");

  autoLockGroupsConfig.update(
    "autoLockGroups",
    {
      ...(result?.globalValue ?? {}),
      [PochiTaskEditorProvider.viewType]: true,
    },
    vscode.ConfigurationTarget.Global,
  );
}

async function openTaskInColumn(uri: vscode.Uri) {
  const params = PochiTaskEditorProvider.parseTaskUri(uri);
  if (!params) {
    throw new Error(`Failed to parse task URI: ${uri.toString()}`);
  }
  const viewColumn = await getViewColumnForTask(params);
  await vscode.commands.executeCommand(
    "vscode.openWith",
    uri,
    PochiTaskEditorProvider.viewType,
    { preview: false, viewColumn },
  );
}

function autoCleanTabGroupLock() {
  return vscode.window.tabGroups.onDidChangeTabs((event) => {
    // if we have more than one tab group, do nothing. vscode will close tab group when it has no tab
    if (vscode.window.tabGroups.all.length > 1) {
      return;
    }

    // if the tab group still have pochi tab, do nothing
    if (
      vscode.window.tabGroups.all[0].tabs.filter(
        (tab) =>
          tab.input instanceof vscode.TabInputCustom &&
          tab.input.viewType === PochiTaskEditorProvider.viewType,
      ).length > 0
    ) {
      return;
    }

    // if closed tabs contain pochi tab, unlock this tab group
    if (
      event.closed.length > 0 &&
      event.closed.some(
        (tab) =>
          tab.input instanceof vscode.TabInputCustom &&
          tab.input.viewType === PochiTaskEditorProvider.viewType,
      )
    ) {
      vscode.commands.executeCommand("workbench.action.unlockEditorGroup");
    }
  });
}
