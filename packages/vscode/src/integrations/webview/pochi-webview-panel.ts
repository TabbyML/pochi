import { BaseWebview } from "@/integrations/webview/base-webview";
import { VSCodeHostImpl } from "@/integrations/webview/vscode-host-impl";
import { WebviewSessionManager } from "@/integrations/webview/webview-session-manager";
import { AuthEvents } from "@/lib/auth-events";
import { getUri } from "@/lib/get-uri";
import { getLogger } from "@getpochi/common";
import type {
  ResourceURI,
  SessionState,
  VSCodeHostApi,
} from "@getpochi/common/vscode-webui-bridge";
import { container } from "tsyringe";
import * as vscode from "vscode";
import { PochiConfiguration } from "../configuration";

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
  extends BaseWebview
  implements vscode.Disposable
{
  private static readonly viewType = "pochiEditor";
  private static panels = new Map<string, PochiWebviewPanel>();
  private static panelCounter = 0;

  private readonly panel: vscode.WebviewPanel;

  private constructor(
    panel: vscode.WebviewPanel,
    sessionId: string,
    context: vscode.ExtensionContext,
    events: AuthEvents,
    pochiConfiguration: PochiConfiguration,
    sessionManager: WebviewSessionManager,
    vscodeHost: VSCodeHostImpl,
  ) {
    super(
      sessionId,
      context,
      events,
      pochiConfiguration,
      sessionManager,
      vscodeHost,
    );
    this.panel = panel;

    // Set webview options
    this.panel.webview.options = {
      enableScripts: true,
      enableCommandUris: true,
      localResourceRoots: [this.context.extensionUri],
    };

    // Use base class methods
    this.setupWebviewHtml(this.panel.webview);
    this.setupAuthEventListeners();

    // Listen to panel events
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    // Create webview thread
    this.createWebviewThread(this.panel.webview);

    // Store panel reference
    PochiWebviewPanel.panels.set(sessionId, this);
  }

  protected getReadResourceURI(): VSCodeHostApi["readResourceURI"] {
    return async (): Promise<ResourceURI> => {
      return {
        logo128: getUri(this.panel.webview, this.context.extensionUri, [
          "assets",
          "icons",
          "logo128.png",
        ]).toString(),
      };
    };
  }

  public static createOrShow(extensionUri: vscode.Uri): void {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    // Generate unique session ID
    const sessionId = `editor-${Date.now()}-${++PochiWebviewPanel.panelCounter}`;

    // Create a new panel
    const panel = vscode.window.createWebviewPanel(
      PochiWebviewPanel.viewType,
      "Pochi",
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [extensionUri],
      },
    );

    // Set icon
    panel.iconPath = {
      light: vscode.Uri.joinPath(
        extensionUri,
        "assets",
        "icons",
        "logo128.png",
      ),
      dark: vscode.Uri.joinPath(extensionUri, "assets", "icons", "logo128.png"),
    };

    // Get dependencies from container
    const context = container.resolve<vscode.ExtensionContext>(
      "vscode.ExtensionContext",
    );
    const events = container.resolve(AuthEvents);
    const pochiConfiguration = container.resolve(PochiConfiguration);
    const sessionManager = container.resolve(WebviewSessionManager);
    const vscodeHost = container.resolve(VSCodeHostImpl);

    // Create session
    sessionManager.createSession(sessionId, "editor");

    // Create panel instance
    new PochiWebviewPanel(
      panel,
      sessionId,
      context,
      events,
      pochiConfiguration,
      sessionManager,
      vscodeHost,
    );

    logger.info(`Created new Pochi panel: ${sessionId}`);
  }

  public reveal(): void {
    this.panel.reveal();
  }

  public async setSidebarState(
    sidebarState: Pick<SessionState, keyof SessionState>,
  ): Promise<void> {
    try {
      // Use the injected vscodeHost instance
      this.vscodeHost.setSessionContext(this.sessionId);
      await this.vscodeHost.setSessionState(sidebarState);
      if (sidebarState.lastVisitedRoute && this.panel.webview) {
        this.panel.webview.postMessage({
          type: "navigate",
          data: {
            path: sidebarState.lastVisitedRoute,
          },
        });
      }
    } catch (error) {
      logger.error("Failed to set sidebar state:", error);
    }
  }

  dispose(): void {
    PochiWebviewPanel.panels.delete(this.sessionId);
    super.dispose();
    this.panel.dispose();
  }
}
