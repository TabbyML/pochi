import type { AuthEvents } from "@/lib/auth-events";
import type {
  ResourceURI,
  VSCodeHostApi,
} from "@getpochi/common/vscode-webui-bridge";
import * as vscode from "vscode";
import type { PochiConfiguration } from "../configuration";
import { getViewColumnForPochiPanel } from "../layout";
import { WebviewBase } from "./base";
import type { VSCodeHostImpl } from "./vscode-host-impl";

export interface PochiWebviewStandalonePanelDefinition {
  id: string;
  title: string;
  route: string;
}

const webviewStandalonePanelDefinitions = [
  {
    id: "browser-agent-settings",
    title: "Browser Agent Settings",
    route: "/browser-agent-settings",
  },
] as const satisfies readonly PochiWebviewStandalonePanelDefinition[];

export type PochiWebviewStandalonePanelId =
  (typeof webviewStandalonePanelDefinitions)[number]["id"];

const webviewStandalonePanelDefinitionMap = new Map<
  PochiWebviewStandalonePanelId,
  PochiWebviewStandalonePanelDefinition
>(
  webviewStandalonePanelDefinitions.map((definition) => [
    definition.id,
    definition,
  ]),
);

export interface PochiWebviewStandalonePanelDependencies {
  context: vscode.ExtensionContext;
  events: AuthEvents;
  pochiConfiguration: PochiConfiguration;
  vscodeHost: VSCodeHostImpl;
}

export class PochiWebviewStandalonePanel
  extends WebviewBase
  implements vscode.Disposable
{
  private static panels = new Map<string, PochiWebviewStandalonePanel>();
  private disposed = false;

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    private readonly definition: PochiWebviewStandalonePanelDefinition,
    dependencies: PochiWebviewStandalonePanelDependencies,
  ) {
    super(
      definition.id,
      dependencies.context,
      dependencies.events,
      dependencies.pochiConfiguration,
      dependencies.vscodeHost,
    );

    this.panel.webview.options = {
      enableScripts: true,
      enableCommandUris: true,
      localResourceRoots: [this.context.extensionUri],
    };

    this.panel.webview.html = this.getHtmlForWebview(
      this.panel.webview,
      "pane",
      {
        type: "standalone",
        payload: { route: definition.route },
      },
    );
    this.panel.iconPath = WebviewBase.getLogoIconPath(
      this.context.extensionUri,
    );

    this.setupAuthEventListeners();
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.createWebviewThread(this.panel.webview);
  }

  static open(
    id: PochiWebviewStandalonePanelId,
    dependencies: PochiWebviewStandalonePanelDependencies,
  ): void {
    const definition = webviewStandalonePanelDefinitionMap.get(id);
    if (!definition) {
      return;
    }

    const currentPanel = PochiWebviewStandalonePanel.panels.get(definition.id);
    if (currentPanel) {
      currentPanel.panel.reveal();
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      `pochi.${definition.id}`,
      definition.title,
      getViewColumnForPochiPanel() ?? vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [dependencies.context.extensionUri],
      },
    );

    PochiWebviewStandalonePanel.panels.set(
      definition.id,
      new PochiWebviewStandalonePanel(panel, definition, dependencies),
    );
  }

  protected getReadResourceURI(): VSCodeHostApi["readResourceURI"] {
    return async (): Promise<ResourceURI> => {
      return this.buildResourceURI(this.panel.webview);
    };
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;

    if (PochiWebviewStandalonePanel.panels.get(this.definition.id) === this) {
      PochiWebviewStandalonePanel.panels.delete(this.definition.id);
    }

    super.dispose();
    this.panel.dispose();
  }
}
