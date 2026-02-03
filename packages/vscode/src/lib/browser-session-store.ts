import { spawn } from "node:child_process";
import type { BrowserSession } from "@getpochi/common/vscode-webui-bridge";
import { signal } from "@preact/signals-core";
import { injectable, singleton } from "tsyringe";
import type * as vscode from "vscode";
import { getAvailablePort } from "./get-available-port";

@injectable()
@singleton()
export class BrowserSessionStore implements vscode.Disposable {
  browserSessions = signal<Record<string, BrowserSession>>({});

  dispose() {
    for (const taskId of Object.keys(this.browserSessions.value)) {
      void this.unregisterBrowserSession(taskId);
    }
  }

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
    // Cleanup agent-browser process
    const envs = this.getAgentBrowserEnvs(taskId);
    if (envs) {
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

    const { [taskId]: _, ...rest } = this.browserSessions.value;
    this.browserSessions.value = rest;
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
