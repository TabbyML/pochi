import { spawn } from "node:child_process";
import { signal } from "@preact/signals-core";
import { getLogger } from "../base";
import { getCorsProxyUrl } from "../cors-proxy";
import { isVSCodeEnvironment } from "../env-utils";
import type { BrowserSession } from "./types";
import { getAvailablePort } from "./utils";

const logger = getLogger("BrowserSessionStore");

// Define a minimal Disposable interface to avoid vscode dependency
type Disposable = { dispose(): void };

export class BrowserSessionStore implements Disposable {
  browserSessions = signal<Record<string, BrowserSession>>({});

  dispose() {
    for (const taskId of Object.keys(this.browserSessions.value)) {
      this.unregisterBrowserSession(taskId);
    }
    logger.trace("BrowserSessionStore disposed");
  }

  async registerBrowserSession(taskId: string, parentTaskId?: string) {
    const browserSession: BrowserSession = {
      parentTaskId,
    };

    // If we are in VSCode environment, we need to enable the websocket
    if (isVSCodeEnvironment()) {
      const port = await getAvailablePort();
      browserSession.port = port;
      browserSession.streamUrl = getCorsProxyUrl(`ws://localhost:${port}`);
    }

    this.browserSessions.value = {
      ...this.browserSessions.value,
      [taskId]: browserSession,
    };
    logger.trace(
      `Registering browser session for task ${taskId}`,
      browserSession,
    );
    return browserSession;
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

    const { [taskId]: browserSession, ...rest } = this.browserSessions.value;
    this.browserSessions.value = rest;
    logger.trace(
      `Unregistering browser session for task ${taskId}`,
      browserSession,
    );
  }

  async unregisterBrowserSessionsByParentTaskId(parentTaskId: string) {
    const browserSessionsToUnregister = Object.entries(
      this.browserSessions.value,
    ).filter(([_, session]) => session.parentTaskId === parentTaskId);

    if (browserSessionsToUnregister.length === 0) {
      return;
    }

    for (const [taskId] of browserSessionsToUnregister) {
      await this.unregisterBrowserSession(taskId);
    }
    logger.trace(
      `Unregistering browser sessions for parent task ${parentTaskId}`,
      browserSessionsToUnregister,
    );
  }

  getAgentBrowserEnvs(taskId: string): Record<string, string> | undefined {
    const envs: Record<string, string> = {};

    const browserSession = this.browserSessions.value[taskId];
    if (!browserSession) {
      return envs;
    }

    envs.AGENT_BROWSER_SESSION = taskId;

    // If we are in VSCode environment, we need to enable the websocket
    if (isVSCodeEnvironment()) {
      envs.AGENT_BROWSER_STREAM_PORT = String(browserSession.port);
    }

    logger.trace(`Getting agent browser envs for task ${taskId}`, envs);
    return envs;
  }
}
