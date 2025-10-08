import type { AuthEvents } from "@/lib/auth-events";
import { getNonce } from "@/lib/get-nonce";
import { getUri } from "@/lib/get-uri";
import { getLogger } from "@getpochi/common";
import { getCorsProxyPort } from "@getpochi/common/cors-proxy";
import type {
  ResourceURI,
  SessionState,
  VSCodeHostApi,
  WebviewHostApi,
} from "@getpochi/common/vscode-webui-bridge";
import {
  getServerBaseUrl,
  getSyncBaseUrl,
} from "@getpochi/common/vscode-webui-bridge";
import { Thread } from "@quilted/threads";
import * as vscode from "vscode";
import type { PochiConfiguration } from "../configuration";
import type { VSCodeHostImpl } from "./vscode-host-impl";

const logger = getLogger("WebviewBase");

/**
 * Path segments for the logo resource
 */
const LogoPathSegments = ["assets", "icons", "logo128.png"];

/**
 * BASE WEBVIEW CLASS
 *
 * Abstract base class that provides common functionality for both:
 * - Sidebar webviews (RagdollWebviewProvider)
 * - Editor tab webviews (PochiWebviewPanel)
 *
 * Handles:
 * - HTML content generation
 * - Webview thread creation and management
 * - Auth event handling
 * - Session management integration
 */
export abstract class WebviewBase implements vscode.Disposable {
  protected webviewHost?: WebviewHostApi;
  protected disposables: vscode.Disposable[] = [];
  protected webviewReadyCallbacks: (() => void)[] = [];
  protected sessionState: SessionState = {};

  constructor(
    protected readonly sessionId: string,
    protected readonly context: vscode.ExtensionContext,
    protected readonly events: AuthEvents,
    protected readonly pochiConfiguration: PochiConfiguration,
    protected readonly vscodeHost: VSCodeHostImpl,
  ) {}

  /**
   * Build resource URIs for the webview
   */
  protected buildResourceURI(webview: vscode.Webview): ResourceURI {
    return {
      logo128: getUri(
        webview,
        this.context.extensionUri,
        LogoPathSegments,
      ).toString(),
    };
  }

  /**
   * Get the logo icon path for VS Code UI
   */
  protected static getLogoIconPath(
    extensionUri: vscode.Uri,
  ): vscode.Uri | { light: vscode.Uri; dark: vscode.Uri } {
    return vscode.Uri.joinPath(extensionUri, ...LogoPathSegments);
  }

  protected getHtmlForWebview(
    webview: vscode.Webview,
    kind: "sidebar" | "pane",
  ): string {
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
    const injectGlobalVars = `<script type="module" nonce="${nonce}">
      window.POCHI_CORS_PROXY_PORT = "${getCorsProxyPort()}";
      window.POCHI_LOG = "${this.pochiConfiguration.advancedSettings.value.webviewLogLevel || ""}";
      window.POCHI_WEBVIEW_KIND = "${kind}";
    </script>`;

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
        `media-src ${webview.cspSource} https://* blob: data:`,
        `script-src 'nonce-${nonce}' 'unsafe-eval'`,
        `style-src ${webview.cspSource} 'unsafe-inline'`,
        `font-src ${webview.cspSource}`,
        `connect-src ${getServerBaseUrl()} ${getSyncBaseUrl()} ${getSyncBaseUrl().replace("http", "ws")} https://*.vscode-cdn.net https://* http://*:* data: blob:`,
        "worker-src data: blob:",
      ];
      const cspHeader = `<meta http-equiv="Content-Security-Policy" content="${csp.join("; ")}">`;

      return this.buildHtml(
        [cspHeader, style, setiFontStyle],
        [assetLoaderScript, injectGlobalVars, script],
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
      `media-src ${devWebUIHttpBaseUrl} ${devWebUIHttpBaseUrlIp} https://* blob: data:`,
      `script-src 'nonce-${nonce}' ${devWebUIHttpBaseUrl} ${devWebUIHttpBaseUrlIp} '${reactRefreshHash}' 'unsafe-eval'`,
      `style-src ${webview.cspSource} 'self' 'unsafe-inline'`,
      `font-src ${webview.cspSource}`,
      `connect-src ${devWebUIHttpBaseUrl} ${devWebUIHttpBaseUrlIp} ${devWebUIWsBaseUrl} ${devWebUIWsBaseUrlIp} ${getServerBaseUrl()} ${getSyncBaseUrl()} ${getSyncBaseUrl().replace("http", "ws")} https://* http://*:* data: blob:`,
      `worker-src ${devWebUIHttpBaseUrl} blob:`,
    ];
    const cspHeader = `<meta http-equiv="Content-Security-Policy" content="${csp.join("; ")}">`;

    return this.buildHtml(
      [cspHeader, setiFontStyle],
      [injectGlobalVars, reactRefresh, script],
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

  protected setupAuthEventListeners(): void {
    this.disposables.push(
      this.events.loginEvent.event(() => {
        this.webviewHost?.onAuthChanged();
      }),
      this.events.logoutEvent.event(() => {
        this.webviewHost?.onAuthChanged();
      }),
    );
  }

  protected async createWebviewThread(
    webview: vscode.Webview,
  ): Promise<Thread<WebviewHostApi, VSCodeHostApi>> {
    const vscodeHostApi = this.createVSCodeHostApi();

    // See "tabby-threads/source/targets/iframe/shared.ts"
    const checkMessage = "quilt.threads.ping";
    const responseMessage = "quilt.threads.pong";
    let connected = false;

    const connectedPromise = new Promise<void>((resolve) => {
      const { dispose } = webview.onDidReceiveMessage((message) => {
        if (message === responseMessage) {
          logger.info(`Webview ${this.sessionId} ready`);
          connected = true;
          dispose();
          resolve();
        }
      });

      // Send ping to check if webview is ready
      webview.postMessage(checkMessage);
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
            if (message === responseMessage) return;
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
        exports: vscodeHostApi,
        imports: [
          "openTask",
          "openTaskList",
          "openSettings",
          "onAuthChanged",
          "isFocused",
          "commitStoreEvent",
        ],
      },
    );

    // Wait for connection to be established before returning
    await connectedPromise;

    // Set webviewHost and execute ready callbacks
    this.webviewHost = thread.imports;
    for (const callback of this.webviewReadyCallbacks) {
      callback();
    }
    this.webviewReadyCallbacks = [];

    return thread;
  }

  public onWebviewReady(callback: () => void): void {
    if (this.webviewHost) {
      // Already ready, execute immediately
      callback();
    } else {
      // Add to pending callbacks
      this.webviewReadyCallbacks.push(callback);
    }
  }

  private createVSCodeHostApi(): VSCodeHostApi {
    const vscodeHost = this.vscodeHost;

    const wrapper: VSCodeHostApi = {
      ...vscodeHost,
      getSessionState: async (keys) => {
        const currentState = this.sessionState;
        if (!keys || keys.length === 0) {
          return { ...currentState };
        }
        return keys.reduce(
          (filtered, key) => {
            if (Object.prototype.hasOwnProperty.call(currentState, key)) {
              filtered[key] = currentState[key];
            }
            return filtered;
          },
          {} as Pick<SessionState, keyof SessionState>,
        );
      },
      setSessionState: async (state) => {
        this.sessionState = { ...this.sessionState, ...state };
      },
      readResourceURI: this.getReadResourceURI(),
    };

    return wrapper;
  }

  // Abstract methods to be implemented by subclasses
  protected abstract getReadResourceURI(): VSCodeHostApi["readResourceURI"];

  public dispose(): void {
    // Clean up disposables
    while (this.disposables.length) {
      const disposable = this.disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }
}

export const commitStore = new vscode.EventEmitter<{ event: unknown }>();
