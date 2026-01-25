import { getLogger } from "@getpochi/common";
import type { BrowserSession } from "@getpochi/common/vscode-webui-bridge";
import { signal } from "@preact/signals-core";
import { injectable, singleton } from "tsyringe";
import { getAvailablePort } from "./get-available-port";

const logger = getLogger("BrowserSessionStore");

@injectable()
@singleton()
export class BrowserSessionStore {
  browserSessions = signal<Record<string, BrowserSession>>({});

  registerBrowserSession(taskId: string, browserSession: BrowserSession) {
    logger.debug(`Registering browser session for task ${taskId}`);
    this.browserSessions.value = {
      ...this.browserSessions.value,
      [taskId]: browserSession,
    };
  }

  closeBrowserSession(taskId: string) {
    logger.debug(`Closing browser session for task ${taskId}`);
    const { [taskId]: _, ...rest } = this.browserSessions.value;
    this.browserSessions.value = rest;
  }

  async getAgentBrowserEnvs(taskId: string): Promise<Record<string, string>> {
    const browserSession = this.browserSessions.value[taskId];
    return {
      AGENT_BROWSER_SESSION: taskId,
      AGENT_BROWSER_STREAM_PORT: String(
        browserSession?.port || (await getAvailablePort()),
      ),
    };
  }
}
