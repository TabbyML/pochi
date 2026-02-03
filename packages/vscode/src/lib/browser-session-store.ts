import { spawn } from "node:child_process";
import { getCorsProxyUrl } from "@getpochi/common/cors-proxy";
import type { BrowserSession } from "@getpochi/common/vscode-webui-bridge";
import { signal } from "@preact/signals-core";
import { injectable, singleton } from "tsyringe";
import { getAvailablePort } from "./get-available-port";

@injectable()
@singleton()
export class BrowserSessionStore {
  browserSessions = signal<Record<string, BrowserSession>>({});

  async registerBrowserSession(taskId: string) {
    const port = await getAvailablePort();
    this.browserSessions.value = {
      ...this.browserSessions.value,
      [taskId]: {
        port,
        streamUrl: getCorsProxyUrl(`ws://localhost:${port}`),
      },
    };
  }

  async unregisterBrowserSession(taskId: string) {
    const { [taskId]: _, ...rest } = this.browserSessions.value;
    this.browserSessions.value = rest;

    // Cleanup agent-browser process
    const envs = this.getAgentBrowserEnvs(taskId);
    const child = spawn("agent-browser", ["close"], {
      env: {
        ...process.env,
        ...envs,
      },
      detached: true,
      stdio: "ignore",
    });
    child.unref();
  }

  getAgentBrowserEnvs(taskId: string): Record<string, string> | undefined {
    const browserSession = this.browserSessions.value[taskId];
    if (!browserSession) {
      return;
    }
    return {
      AGENT_BROWSER_SESSION: taskId,
      AGENT_BROWSER_STREAM_PORT: String(browserSession.port),
    };
  }
}
