// biome-ignore lint/style/useImportType: needed for dependency injection
import { AuthEvents } from "@/lib/auth-events";
import { getUri } from "@/lib/get-uri";
import type {
  ResourceURI,
  VSCodeHostApi,
  WebviewHostApi,
} from "@getpochi/common/vscode-webui-bridge";
import { inject, injectable, singleton } from "tsyringe";
import * as vscode from "vscode";
// biome-ignore lint/style/useImportType: needed for dependency injection
import { PochiConfiguration } from "../configuration";
import { WebviewBase } from "./base";
// biome-ignore lint/style/useImportType: needed for dependency injection
import { VSCodeHostImpl } from "./vscode-host-impl";

/**
 * This class manages the Pochi webview that appears in the VS Code sidebar.
 * It uses vscode.WebviewViewProvider to create a persistent view that stays
 * in the sidebar activity bar.
 *
 * Key characteristics:
 * - Always visible in sidebar when Pochi extension is active
 * - Uses session ID: "sidebar-default"
 * - Managed by VS Code's WebviewView system
 * - Single instance per VS Code window
 */
@injectable()
@singleton()
export class PochiWebviewSidebar
  extends WebviewBase
  implements vscode.WebviewViewProvider, vscode.Disposable
{
  public static readonly viewType = "pochiWebui";

  private view?: vscode.WebviewView;
  private webviewHostReady = new vscode.EventEmitter<WebviewHostApi>();

  constructor(
    @inject("vscode.ExtensionContext")
    context: vscode.ExtensionContext,
    events: AuthEvents,
    pochiConfiguration: PochiConfiguration,
    vscodeHost: VSCodeHostImpl,
  ) {
    super("sidebar-default", context, events, pochiConfiguration, vscodeHost);
  }

  private providerDisposables: vscode.Disposable[] = [
    vscode.window.registerWebviewViewProvider(
      PochiWebviewSidebar.viewType,
      this,
      { webviewOptions: { retainContextWhenHidden: true } },
    ),
  ];

  protected getReadResourceURI(): VSCodeHostApi["readResourceURI"] {
    return async (): Promise<ResourceURI> => {
      if (!this.view) {
        throw new Error("Webview not initialized");
      }

      return {
        logo128: getUri(this.view.webview, this.context.extensionUri, [
          "assets",
          "icons",
          "logo128.png",
        ]).toString(),
      };
    };
  }

  public async retrieveWebviewHost(): Promise<WebviewHostApi> {
    if (this.webviewHost) {
      return this.webviewHost;
    }

    return new Promise((resolve) => {
      this.disposables.push(
        this.webviewHostReady.event((host) => resolve(host)),
      );
    });
  }

  public async getCurrentSessionState() {
    return this.sessionState;
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ) {
    this.view = webviewView;

    this.view.webview.options = {
      enableScripts: true,
      enableCommandUris: true,
      localResourceRoots: [this.context.extensionUri],
    };

    // Use base class methods
    this.setupWebviewHtml(this.view.webview);
    this.setupAuthEventListeners();

    this.createWebviewThread(webviewView.webview).then(() => {
      if (this.webviewHost) {
        this.webviewHostReady.fire(this.webviewHost);
      }
    });
  }

  dispose() {
    super.dispose();
    for (const disposable of this.providerDisposables) {
      disposable.dispose();
    }
    this.providerDisposables = [];
    this.webviewHostReady.dispose();
  }
}
