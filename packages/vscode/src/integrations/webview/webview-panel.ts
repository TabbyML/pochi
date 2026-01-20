import * as path from "node:path";
import { PochiFileSystemProvider } from "@/integrations/editor/pochi-file-system-provider";
import { AuthEvents } from "@/lib/auth-events";
import { WorkspaceScope, workspaceScoped } from "@/lib/workspace-scoped";
import { getLogger, toErrorMessage } from "@getpochi/common";
import {
  type PochiTaskInfo,
  type PochiTaskParams,
  type ResourceURI,
  type VSCodeHostApi,
  getTaskDisplayTitle,
} from "@getpochi/common/vscode-webui-bridge";
import { container } from "tsyringe";
import * as vscode from "vscode";
import { z } from "zod/v4";
import { PochiConfiguration } from "../configuration";
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
  // Map of active panels, key is the task UID
  private static panels = new Map<string, PochiWebviewPanel>();
  private readonly panel: vscode.WebviewPanel;

  constructor(
    panel: vscode.WebviewPanel,
    sessionId: string,
    context: vscode.ExtensionContext,
    events: AuthEvents,
    pochiConfiguration: PochiConfiguration,
    vscodeHost: VSCodeHostImpl,
    info: PochiTaskInfo,
  ) {
    super(sessionId, context, events, pochiConfiguration, vscodeHost);
    this.panel = panel;

    // Push to static map
    PochiWebviewPanel.panels.set(info.uid, this);

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
      info,
    );
    this.setupAuthEventListeners();
    this.setupFileWatcher(info.cwd);

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

  static readTaskFile(taskId: string, filePath: string) {
    return PochiWebviewPanel.panels
      .get(taskId)
      ?.webviewHost?.readTaskFile(taskId, filePath);
  }

  static writeTaskFile(taskId: string, filePath: string, content: string) {
    return PochiWebviewPanel.panels
      .get(taskId)
      ?.webviewHost?.writeTaskFile(taskId, filePath, content);
  }

  static queryTaskOutput(taskId: string) {
    const directPanel = PochiWebviewPanel.panels.get(taskId);
    const fallbackPanel = directPanel
      ? undefined
      : PochiWebviewPanel.panels.values().next().value;
    const panel = directPanel ?? fallbackPanel;
    return panel?.webviewHost?.queryTaskOutput(taskId);
  }

  dispose(): void {
    super.dispose();
    this.panel.dispose();
    // Remove from static map when disposed
    for (const [uid, panel] of PochiWebviewPanel.panels) {
      if (panel === this) {
        PochiWebviewPanel.panels.delete(uid);
        // When the webview panel is disposed (e.g. task is closed),
        // we must also close any open editor tabs (pochi:// scheme) associated with this task.
        PochiFileSystemProvider.closePochiTabs(uid);
        break;
      }
    }
  }
}

export class PochiTaskDocument implements vscode.CustomDocument {
  constructor(
    public uri: vscode.Uri,
    public params?: PochiTaskInfo,
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
  private static readonly taskInfo = new Map<string, PochiTaskInfo>();

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

  public static createTaskUri(params: TaskUri): vscode.Uri {
    const worktreeName = container
      .resolve(WorktreeManager)
      .getWorktreeDisplayName(params.cwd);
    const displayName = getTaskDisplayTitle({
      worktreeName: worktreeName ?? path.basename(params.cwd),
      uid: params.uid,
    });
    return vscode.Uri.from({
      scheme: PochiTaskEditorProvider.scheme,
      path: `/pochi/task/${displayName}`,
      query: JSON.stringify({
        uid: params.uid,
        cwd: params.cwd,
      } satisfies TaskUri), // keep query string stable for identification
    });
  }

  public static parseTaskUri(uri: vscode.Uri): TaskUri | null {
    try {
      const query = JSON.parse(decodeURIComponent(uri.query));
      return TaskUri.parse(query);
    } catch {
      return null;
    }
  }

  public static async openTaskEditor(
    params: PochiTaskParams,
    options?: { keepEditor?: boolean; viewColumn?: vscode.ViewColumn },
  ) {
    try {
      const uid =
        ((params.type === "new-task" || params.type === "open-task") &&
          params.uid) ||
        crypto.randomUUID();
      const taskInfo: PochiTaskInfo = {
        ...params,
        uid,
      };
      const uri = PochiTaskEditorProvider.createTaskUri(taskInfo);
      PochiTaskEditorProvider.taskInfo.set(uri.toString(), taskInfo);
      await openTaskInColumn(uri, options);
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

  public static async createNewTask(uri: vscode.Uri) {
    try {
      const query = PochiTaskEditorProvider.parseTaskUri(uri);

      if (!query) {
        vscode.window.showErrorMessage(
          "Failed to create new Pochi task: missing parameters",
        );
        return;
      }

      // open a new panel
      await PochiTaskEditorProvider.openTaskEditor({
        type: "new-task",
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
    const params = PochiTaskEditorProvider.taskInfo.get(uri.toString());
    return new PochiTaskDocument(uri, params);
  }

  async resolveCustomEditor(
    document: PochiTaskDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken,
  ): Promise<void> {
    try {
      const uri = PochiTaskEditorProvider.parseTaskUri(document.uri);
      if (!uri) {
        throw new Error(
          `Failed to open Pochi task: invalid parameters for ${document.uri.toString()}`,
        );
      }

      const params = document.params;
      if (params) {
        await this.setupWebview(webviewPanel, params);
      } else {
        await this.setupWebview(webviewPanel, {
          type: "open-task",
          ...uri,
        });
      }
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
    info: PochiTaskInfo,
  ): Promise<PochiWebviewPanel> {
    const { cwd, uid } = info;
    const mainWorkspaceScope = container.resolve(WorkspaceScope);
    const isMainWorkspace = cwd === mainWorkspaceScope.cwd;
    // reuse container for workspace root as siderbar has create VSCodeHostImpl for workspace root
    const workspaceContainer = isMainWorkspace
      ? container
      : workspaceScoped(cwd);

    const events = workspaceContainer.resolve(AuthEvents);
    const pochiConfiguration = workspaceContainer.resolve(PochiConfiguration);
    const vscodeHost = workspaceContainer.resolve(VSCodeHostImpl);
    vscodeHost.taskId = uid;

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
      info,
    );

    logger.debug(`Opened Pochi task editor: cwd=${cwd}, uid=${uid}`);
    return pochiPanel;
  }
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

async function openTaskInColumn(
  uri: vscode.Uri,
  options?: { keepEditor?: boolean; viewColumn?: vscode.ViewColumn },
) {
  const params = PochiTaskEditorProvider.parseTaskUri(uri);
  if (!params) {
    throw new Error(`Failed to parse task URI: ${uri.toString()}`);
  }

  if (options?.keepEditor === true) {
    vscode.commands.executeCommand("workbench.action.keepEditor", uri, {
      preserveFocus: true,
    });
    return;
  }

  const viewColumn =
    options?.viewColumn ??
    (await getViewColumnForTask({
      cwd: params.cwd,
    }));

  await vscode.commands.executeCommand(
    "vscode.openWith",
    uri,
    PochiTaskEditorProvider.viewType,
    { preview: true, viewColumn },
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
      vscode.window.tabGroups.all.length > 0 &&
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

const TaskUri = z.object({
  cwd: z.string(),
  uid: z.string(),
});

type TaskUri = z.infer<typeof TaskUri>;
