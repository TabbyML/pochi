// biome-ignore lint/style/useImportType: needed for dependency injection
import { AuthEvents } from "@/lib/auth-events";
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

type SidebarViewType = "pochiSidebarDark" | "pochiSidebarLight";

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
  readonly viewTypes: readonly SidebarViewType[] = [
    "pochiSidebarDark",
    "pochiSidebarLight",
  ];

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

    void this.initializeThemeContext(vscode.window.activeColorTheme.kind);
    this.disposables.push(
      vscode.window.onDidChangeActiveColorTheme((theme) => {
        void this.updateThemeContext(theme.kind);
      }),
    );

    for (const viewType of this.viewTypes) {
      this.disposables.push(
        vscode.window.registerWebviewViewProvider(viewType, this, {
          webviewOptions: { retainContextWhenHidden: true },
        }),
      );
    }
  }

  private async initializeThemeContext(
    kind: vscode.ColorThemeKind,
  ): Promise<void> {
    await vscode.commands.executeCommand(
      "setContext",
      "pochi.themeContextReady",
      false,
    );
    await this.updateThemeContext(kind);
  }

  private async updateThemeContext(kind: vscode.ColorThemeKind): Promise<void> {
    await vscode.commands.executeCommand(
      "setContext",
      "pochi.isDarkTheme",
      this.isDarkTheme(kind),
    );
    await vscode.commands.executeCommand(
      "setContext",
      "pochi.themeContextReady",
      true,
    );
  }

  private isDarkTheme(kind: vscode.ColorThemeKind): boolean {
    return (
      kind === vscode.ColorThemeKind.Dark ||
      kind === vscode.ColorThemeKind.HighContrast
    );
  }

  protected getReadResourceURI(): VSCodeHostApi["readResourceURI"] {
    return async (): Promise<ResourceURI> => {
      if (!this.view) {
        throw new Error("Webview not initialized");
      }

      return this.buildResourceURI(this.view.webview);
    };
  }

  public getSiderbarViewType(
    kind: vscode.ColorThemeKind = vscode.window.activeColorTheme.kind,
  ): SidebarViewType {
    if (this.isDarkTheme(kind)) {
      return "pochiSidebarDark";
    }
    return "pochiSidebarLight";
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
    this.view.webview.html = this.getHtmlForWebview(
      this.view.webview,
      "sidebar",
    );
    this.setupAuthEventListeners();

    this.createWebviewThread(webviewView.webview).then(() => {
      if (this.webviewHost) {
        this.webviewHostReady.fire(this.webviewHost);
      }
    });
  }

  dispose() {
    super.dispose();
    this.webviewHostReady.dispose();
  }
}
