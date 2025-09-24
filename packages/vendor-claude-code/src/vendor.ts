import type { UserInfo } from "@getpochi/common/configuration";
import { VendorBase } from "@getpochi/common/vendor";
import type { AuthOutput, ModelOptions } from "@getpochi/common/vendor";
import { fetchUserInfo, renewCredentials, startOAuthFlow } from "./auth";
import { getProxyUrl, startProxyServer, stopProxyServer } from "./proxy";
import { type ClaudeCodeCredentials, VendorId } from "./types";

export class ClaudeCode extends VendorBase {
  private proxyStarted = false;

  constructor() {
    super(VendorId);
  }

  /**
   * Initialize the proxy server for webview usage
   * @param getCredentials Function to retrieve current credentials
   * @param port Optional port number (default: 54321)
   */
  async initializeProxy(
    getCredentials: () => Promise<ClaudeCodeCredentials | undefined>,
    port?: number,
  ): Promise<string> {
    if (this.proxyStarted) {
      const url = getProxyUrl();
      if (url) {
        return url;
      }
    }

    const proxy = await startProxyServer({
      port,
      getCredentials,
    });

    this.proxyStarted = true;

    return proxy.url;
  }

  /**
   * Stop the proxy server
   */
  stopProxy(): void {
    if (this.proxyStarted) {
      stopProxyServer();
      this.proxyStarted = false;
    }
  }

  /**
   * Get the current proxy URL if running
   */
  getProxyUrl(): string | null {
    return getProxyUrl();
  }

  override authenticate(): Promise<AuthOutput> {
    return startOAuthFlow();
  }

  override async renewCredentials(
    credentials: ClaudeCodeCredentials,
  ): Promise<ClaudeCodeCredentials | undefined> {
    return renewCredentials(credentials);
  }

  override async fetchUserInfo(
    credentials: ClaudeCodeCredentials,
  ): Promise<UserInfo> {
    return fetchUserInfo(credentials);
  }

  override async fetchModels(): Promise<Record<string, ModelOptions>> {
    return {
      "claude-opus-4-1-20250805": {
        contextWindow: 200_000,
        useToolCallMiddleware: true,
      },
      "claude-sonnet-4-20250514": {
        contextWindow: 200_000,
        useToolCallMiddleware: true,
      },
    };
  }
}
