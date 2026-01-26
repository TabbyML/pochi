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
        streamUrl: `ws://localhost:${port}`,
      },
    };
  }

  async unregisterBrowserSession(taskId: string) {
    const { [taskId]: _, ...rest } = this.browserSessions.value;
    this.browserSessions.value = rest;
  }

  getAgentBrowserEnvs(taskId: string): Record<string, string> {
    const browserSession = this.browserSessions.value[taskId];
    return {
      AGENT_BROWSER_SESSION: taskId,
      AGENT_BROWSER_STREAM_PORT: String(browserSession?.port),
    };
  }
}
