import { AuthEvents } from "@/lib/auth-events";
import { workspaceScoped } from "@/lib/workspace-scoped";
import { getLogger, toErrorMessage } from "@getpochi/common";
import { getWorktreeNameFromWorktreePath } from "@getpochi/common/git-utils";
import type {
  NewTaskPanelParams,
  ResourceURI,
  TaskPanelParams,
  VSCodeHostApi,
} from "@getpochi/common/vscode-webui-bridge";
import * as vscode from "vscode";
import { PochiConfiguration } from "../configuration";
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
  private readonly uri: vscode.Uri;

  constructor(
    panel: vscode.WebviewPanel,
    sessionId: string,
    context: vscode.ExtensionContext,
    events: AuthEvents,
    pochiConfiguration: PochiConfiguration,
    vscodeHost: VSCodeHostImpl,
    taskParams: TaskPanelParams,
    uri: vscode.Uri,
  ) {
    super(sessionId, context, events, pochiConfiguration, vscodeHost);
    this.panel = panel;
    this.uri = uri;

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

    PochiTaskEditorProvider.panels.delete(this.uri.toString());
  }
}

export class PochiTaskEditorProvider
  implements vscode.CustomTextEditorProvider, vscode.TextDocumentContentProvider
{
  static readonly viewType = "pochi.taskEditor";
  static readonly scheme = "pochi-task";
  static panels = new Map<string, PochiWebviewPanel>();

  public static register(context: vscode.ExtensionContext): vscode.Disposable {
    const provider = new PochiTaskEditorProvider(context);
    const disposables: vscode.Disposable[] = [];
    disposables.push(
      vscode.workspace.registerTextDocumentContentProvider(
        PochiTaskEditorProvider.scheme,
        provider,
      ),
    );

    disposables.push(
      vscode.window.registerCustomEditorProvider(
        PochiTaskEditorProvider.viewType,
        provider,
        {
          webviewOptions: {
            retainContextWhenHidden: true,
          },
        },
      ),
    );

    setAutoLockGroupsConfig();

    return vscode.Disposable.from(...disposables);
  }

  public static createTaskUri(params: TaskPanelParams): vscode.Uri {
    const worktreeName = getWorktreeNameFromWorktreePath(params.cwd);
    return vscode.Uri.from({
      scheme: PochiTaskEditorProvider.scheme,
      path: `/pochi/task/Pochi - ${worktreeName ?? "main"} - ${
        params.uid.split("-")[0]
      }`,
      query: JSON.stringify(params),
    });
  }

  public static async openTaskInEditor(
    params: TaskPanelParams | NewTaskPanelParams,
  ) {
    try {
      const uri = PochiTaskEditorProvider.createTaskUri({
        ...params,
        uid: params.uid ?? crypto.randomUUID(),
      });
      await openTaskInColumn(uri);
    } catch (error) {
      const errorMessage = toErrorMessage(error);
      vscode.window.showErrorMessage(
        `Failed to open Pochi task: ${errorMessage}`,
      );
      logger.error(`Failed to open Pochi task: ${errorMessage}`, error);
    }
  }

  public static async reset(uri: vscode.Uri) {
    try {
      const panel = PochiTaskEditorProvider.panels.get(uri.toString());

      if (panel) {
        const query = JSON.parse(
          decodeURIComponent(uri.query),
        ) as TaskPanelParams;

        if (!query?.cwd) {
          vscode.window.showErrorMessage(
            "Failed to reset Pochi task: missing parameters",
          );
          return;
        }
        // close current panel
        panel.dispose();
        // open a new panel
        PochiTaskEditorProvider.openTaskInEditor({
          cwd: query.cwd,
        });
      }
    } catch (error) {
      const errorMessage = toErrorMessage(error);
      vscode.window.showErrorMessage(
        `Failed to reset Pochi task: ${errorMessage}`,
      );
      logger.error(`Failed to reset Pochi task: ${errorMessage}`, error);
    }
  }

  constructor(private readonly context: vscode.ExtensionContext) {}

  // emitter and its event
  onDidChangeEmitter = new vscode.EventEmitter<vscode.Uri>();
  onDidChange = this.onDidChangeEmitter.event;
  provideTextDocumentContent(
    _uri: vscode.Uri,
    _token: vscode.CancellationToken,
  ): vscode.ProviderResult<string> {
    return "Pochi Task";
  }

  async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken,
  ): Promise<void> {
    try {
      const params = document.uri.query
        ? (JSON.parse(
            decodeURIComponent(document.uri.query),
          ) as TaskPanelParams)
        : undefined;
      if (!params) {
        vscode.window.showErrorMessage(
          "Failed to open Pochi task: missing parameters",
        );
        return;
      }
      const panel = await this.setupWebview(webviewPanel, params, document.uri);
      PochiTaskEditorProvider.panels.set(document.uri.toString(), panel);
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
    documentUri: vscode.Uri,
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

    const sessionId = `editor-${cwd}-${uid}`;

    const pochiPanel = new PochiWebviewPanel(
      webviewPanel,
      sessionId,
      this.context,
      events,
      pochiConfiguration,
      vscodeHost,
      params,
      documentUri,
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

async function getPochiTaskColumn(): Promise<vscode.ViewColumn> {
  // if we have pochi task opened already, we open new task in same column
  for (const group of vscode.window.tabGroups.all) {
    for (const tab of group.tabs) {
      if (tab.input instanceof vscode.TabInputCustom) {
        if (tab.input.viewType === PochiTaskEditorProvider.viewType) {
          return group.viewColumn;
        }
      }
    }
  }

  // else if we have multiple groups and the first group is empty, we can reuse it
  if (
    vscode.window.tabGroups.all.length > 1 &&
    vscode.window.tabGroups.all[0].tabs.length === 0
  ) {
    return vscode.ViewColumn.One;
  }

  // otherwise, we open new pochi task in a new first column

  // First, focus the very first editor group.
  await vscode.commands.executeCommand(
    "workbench.action.focusFirstEditorGroup",
  );

  // Then, create a new editor group to the left of the currently focused one (which is the first one).
  // This new group will become the new first group and will be active.
  await vscode.commands.executeCommand("workbench.action.newGroupLeft");

  return vscode.ViewColumn.One;
}

async function openTaskInColumn(uri: vscode.Uri) {
  const viewColumn = await getPochiTaskColumn();
  await vscode.commands.executeCommand(
    "vscode.openWith",
    uri,
    PochiTaskEditorProvider.viewType,
    { preview: false, viewColumn },
  );
}
