import { VSCodeHostImpl } from "@/integrations/webview/vscode-host-impl";
// biome-ignore lint/style/useImportType: needed for dependency injection
import { AuthEvents } from "@/lib/auth-events";
import { getNonce } from "@/lib/get-nonce";
import { getUri } from "@/lib/get-uri";
import { getLogger } from "@getpochi/common";
import {
  type ResourceURI,
  type VSCodeHostApi,
  type WebviewHostApi,
  getServerBaseUrl,
} from "@getpochi/common/vscode-webui-bridge";
import { Thread } from "@quilted/threads";
import { container, inject, injectable, singleton } from "tsyringe";
import * as vscode from "vscode";
// biome-ignore lint/style/useImportType: needed for dependency injection
import { PochiConfiguration } from "../configuration";

const logger = getLogger("RagdollWebviewProvider");
@injectable()
@singleton()
export class RagdollWebviewProvider
  implements vscode.WebviewViewProvider, vscode.Disposable
{
  public static readonly viewType = "pochiWebui";

  private view?: vscode.WebviewView;
  private webviewHost?: WebviewHostApi;
  private webviewHostReady = new vscode.EventEmitter<WebviewHostApi>();

  constructor(
    @inject("vscode.ExtensionContext")
    private readonly context: vscode.ExtensionContext,
    private readonly events: AuthEvents,
    private readonly pochiConfiguration: PochiConfiguration,
  ) {}

  private disposables: vscode.Disposable[] = [
    vscode.window.registerWebviewViewProvider(
      RagdollWebviewProvider.viewType,
      this,
      { webviewOptions: { retainContextWhenHidden: true } },
    ),
  ];

  dispose() {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];
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

    this.view.webview.html = this.getHtmlForWebview(this.view.webview);

    this.disposables.push(
      this.events.loginEvent.event(() => {
        this.webviewHost?.onAuthChanged();
      }),
      this.events.logoutEvent.event(() => {
        this.webviewHost?.onAuthChanged();
      }),
    );

    this.createWebviewThread(webviewView.webview).then((thread) => {
      this.webviewHost = thread.imports;
      this.webviewHostReady.fire(this.webviewHost);
    });
  }

  readonly readResourceURI: VSCodeHostApi["readResourceURI"] =
    async (): Promise<ResourceURI> => {
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

  private async createWebviewThread(webview: vscode.Webview) {
    const vscodeHost = container.resolve(VSCodeHostImpl);
    // Inject the readResourceURI to avoid circular dependency
    vscodeHost.readResourceURI = this.readResourceURI;

    // See "tabby-threads/source/targets/iframe/shared.ts"
    const CHECK_MESSAGE = "quilt.threads.ping";
    const RESPONSE_MESSAGE = "quilt.threads.pong";

    let connected = false;

    const connectedPromise = new Promise<void>((resolve) => {
      const { dispose } = webview.onDidReceiveMessage((message) => {
        if (message === RESPONSE_MESSAGE) {
          logger.info("Pochi webview ready now");
          connected = true;
          dispose();
          resolve();
        }
      });

      // Send ping to check if webview is ready
      webview.postMessage(CHECK_MESSAGE);
    });

    const thread = new Thread<WebviewHostApi, VSCodeHostApi>(
      {
        async send(message) {
          if (!connected) {
            await connectedPromise;
          }
          return webview.postMessage(message);
        },
        listen(listen, { signal }) {
          const { dispose } = webview.onDidReceiveMessage((message) => {
            // Ignore connection check messages
            if (message === RESPONSE_MESSAGE) return;
            listen(message);
          });
          signal?.addEventListener(
            "abort",
            () => {
              dispose();
            },
            { once: true },
          );
        },
      },
      {
        exports: vscodeHost,
        imports: [
          "openTask",
          "openTaskList",
          "openSettings",
          "onAuthChanged",
          "isFocused",
        ],
      },
    );

    // Wait for connection to be established before returning
    await connectedPromise;

    return thread;
  }

  private getHtmlForWebview(webview: vscode.Webview) {
    const isProd =
      this.context.extensionMode === vscode.ExtensionMode.Production;

    const setiFontUri = getUri(webview, this.context.extensionUri, [
      "assets",
      "fonts",
      "seti.woff",
    ]);
    const setiFontStyle = `<style type="text/css">
      @font-face {
        font-family: "seti";
        src: url("${setiFontUri}") format("woff");
      }
    </style>`;

    const nonce = getNonce();
    const webuiLoggingScript = `<script type="module" nonce="${nonce}">window.POCHI_LOG = "${this.pochiConfiguration.advancedSettings.value.webviewLogLevel || ""}";</script>`;

    if (isProd) {
      const sqliteWasmUri = getUri(webview, this.context.extensionUri, [
        "assets",
        "webview-ui",
        "dist",
        "wa-sqlite.wasm",
      ]);
      const assetLoaderScript = `<script nonce="${nonce}" type="module">
      window.__assetsPath = (path) => {
        if (path === "wa-sqlite.wasm") {
          return "${sqliteWasmUri}";
        }
        return path;
      }
      window.__workerAssetsPathScript = 'self.__assetsPath = (path) => { if (path === "wa-sqlite.wasm") { return "${sqliteWasmUri}"; }};';
      </script>`;

      const scriptUri = getUri(webview, this.context.extensionUri, [
        "assets",
        "webview-ui",
        "dist",
        "index.js",
      ]);
      const script = `<script nonce="${nonce}" type="module" src="${scriptUri}"></script>`;

      const styleUri = getUri(webview, this.context.extensionUri, [
        "assets",
        "webview-ui",
        "dist",
        "index.css",
      ]);
      const style = `<link rel="stylesheet" href="${styleUri}">`;

      const csp = [
        `default-src 'none';`,
        `img-src ${webview.cspSource} https://* blob: data:`,
        `script-src 'nonce-${nonce}' 'unsafe-eval'`,
        `style-src ${webview.cspSource} 'unsafe-inline'`,
        `font-src ${webview.cspSource}`,
        // https://* is required for local BYOK
        `connect-src ${getServerBaseUrl()} https://*.vscode-cdn.net https://* http://*:* data:`,
        "worker-src data: blob:",
      ];
      const cspHeader = `<meta http-equiv="Content-Security-Policy" content="${csp.join("; ")}">`;

      return this.buildHtml(
        [cspHeader, style, setiFontStyle],
        [assetLoaderScript, webuiLoggingScript, script],
      );
    }

    const devWebUIPort = "4112";
    const devWebUIHttpBaseUrl = `http://localhost:${devWebUIPort}`;
    const devWebUIHttpBaseUrlIp = `http://0.0.0.0:${devWebUIPort}`;
    const devWebUIWsBaseUrl = `ws://localhost:${devWebUIPort}`;
    const devWebUIWsBaseUrlIp = `ws://0.0.0.0:${devWebUIPort}`;

    const scriptUri = vscode.Uri.parse(`${devWebUIHttpBaseUrl}/src/main.tsx`);
    const script = `<script type="module" src="${scriptUri}"></script>`;

    const reactRefresh = /*html*/ `
      <script type="module">
        import RefreshRuntime from "${devWebUIHttpBaseUrl}/@react-refresh"
        RefreshRuntime.injectIntoGlobalHook(window)
        window.$RefreshReg$ = () => {}
        window.$RefreshSig$ = () => (type) => type
        window.__vite_plugin_react_preamble_installed__ = true
      </script>`;

    const reactRefreshHash =
      "sha256-yL+3q2cca0YKq6RvbZxpS67pnyG8uCKFMrhN3CvGX8A=";

    const csp = [
      `default-src 'none';`,
      `img-src ${devWebUIHttpBaseUrl} ${devWebUIHttpBaseUrlIp} https://* blob: data:`,
      `script-src 'nonce-${nonce}' ${devWebUIHttpBaseUrl} ${devWebUIHttpBaseUrlIp} '${reactRefreshHash}' 'unsafe-eval'`,
      `style-src ${webview.cspSource} 'self' 'unsafe-inline'`,
      `font-src ${webview.cspSource}`,
      `connect-src ${devWebUIHttpBaseUrl} ${devWebUIHttpBaseUrlIp} ${devWebUIWsBaseUrl} ${devWebUIWsBaseUrlIp} ${getServerBaseUrl()} https://* data: http://*:*`,
      `worker-src ${devWebUIHttpBaseUrl} blob:`,
    ];
    const cspHeader = `<meta http-equiv="Content-Security-Policy" content="${csp.join("; ")}">`;

    return this.buildHtml(
      [cspHeader, setiFontStyle],
      [webuiLoggingScript, reactRefresh, script],
    );
  }

  private buildHtml(headElements: string[], bodyElements: string[]): string {
    return /*html*/ `<!DOCTYPE html>
    <html lang="en">
      <head>
        <!-- ${new Date()} -->
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Pochi</title>
        <style>body { padding: 0; margin: 0; }</style>
        ${headElements.join("\n")}
      </head>
      <body>
        <div id="app"></div>
        ${bodyElements.join("\n")}
      </body>
    </html>`;
  }
}
