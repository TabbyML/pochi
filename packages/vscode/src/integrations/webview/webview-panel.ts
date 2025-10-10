import { AuthEvents } from "@/lib/auth-events";
import { WorkspaceScope } from "@/lib/workspace-scoped";
import { getLogger } from "@getpochi/common";
import type {
  ResourceURI,
  VSCodeHostApi,
} from "@getpochi/common/vscode-webui-bridge";
import type { DependencyContainer } from "tsyringe";
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
  private static readonly viewType = "pochiPanel";
  private static panels = new Map<string, PochiWebviewPanel>();

  private readonly panel: vscode.WebviewPanel;

  constructor(
    panel: vscode.WebviewPanel,
    sessionId: string,
    context: vscode.ExtensionContext,
    events: AuthEvents,
    pochiConfiguration: PochiConfiguration,
    vscodeHost: VSCodeHostImpl,
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

  public static createOrShow(
    workspaceContainer: DependencyContainer,
    extensionUri: vscode.Uri,
    uid?: string,
  ): void {
    const cwd = workspaceContainer.resolve(WorkspaceScope).cwd;
    const sessionId = `editor-${cwd}`;

    if (PochiWebviewPanel.panels.has(sessionId)) {
      const existingPanel = PochiWebviewPanel.panels.get(sessionId);
      existingPanel?.panel.reveal();
      logger.info(`Revealed existing Pochi panel: ${sessionId}`);
      if (uid) {
        logger.info(`Opening task ${uid} in existing panel`);
        existingPanel?.webviewHost?.openTask({ uid });
      }
      return;
    }

    const worktreeName = cwd?.split(/[\/\\]/).pop();

    // Create a new panel
    const panel = vscode.window.createWebviewPanel(
      PochiWebviewPanel.viewType,
      `Pochi${worktreeName ? ` - ${worktreeName}` : ""}`,
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [extensionUri],
      },
    );

    // Set icon
    panel.iconPath = WebviewBase.getLogoIconPath(extensionUri);

    // Get dependencies from container
    const context = workspaceContainer.resolve<vscode.ExtensionContext>(
      "vscode.ExtensionContext",
    );
    const events = workspaceContainer.resolve(AuthEvents);
    const pochiConfiguration = workspaceContainer.resolve(PochiConfiguration);
    const vscodeHost = workspaceContainer.resolve(VSCodeHostImpl);

    // Create panel instance
    const pochiPanel = new PochiWebviewPanel(
      panel,
      sessionId,
      context,
      events,
      pochiConfiguration,
      vscodeHost,
    );

    PochiWebviewPanel.panels.set(sessionId, pochiPanel);

    if (uid) {
      pochiPanel.onWebviewReady(() => {
        logger.info(`Webview ready, opening task ${uid} in new panel`);
        pochiPanel.webviewHost?.openTask({ uid });
      });
    }

    logger.info(`Created new Pochi panel: ${sessionId}`);
  }

  dispose(): void {
    PochiWebviewPanel.panels.delete(this.sessionId);
    super.dispose();
    this.panel.dispose();
  }
}
