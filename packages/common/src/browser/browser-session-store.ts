import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { signal } from "@preact/signals-core";
import { getLogger } from "../base";
import { getCorsProxyUrl } from "../cors-proxy";
import type { BrowserSession } from "./types";
import { getAvailablePort } from "./utils";

const logger = getLogger("BrowserSessionStore");
const agentBrowserBinDir = path.join(os.homedir(), ".pochi", "bin");
const agentBrowserPath = path.join(
  agentBrowserBinDir,
  process.platform === "win32" ? "agent-browser.exe" : "agent-browser",
);

// Define a minimal Disposable interface to avoid vscode dependency
type Disposable = { dispose(): void };

export class BrowserSessionStore implements Disposable {
  browserSessions = signal<Record<string, BrowserSession>>({});
  private pending = new Map<
    string,
    { parentId?: string; promise: Promise<BrowserSession> }
  >();
  private disposed = false;

  constructor(private readonly options: { proxyStreams?: boolean } = {}) {}

  dispose() {
    this.disposed = true;
    this.pending.clear();
    for (const taskId of Object.keys(this.browserSessions.value)) {
      this.unregisterBrowserSession(taskId);
    }
    logger.trace("BrowserSessionStore disposed");
  }

  async registerBrowserSession(
    taskId: string,
    parentId?: string,
    stream?: boolean,
  ) {
    if (this.disposed) throw new Error("Browser session store is disposed.");
    const existing = this.browserSessions.value[taskId];
    if (existing) {
      existing.parentId ??= parentId;
      return existing;
    }
    const pending = this.pending.get(taskId);
    if (pending) {
      pending.parentId ??= parentId;
      const session = await pending.promise;
      session.parentId ??= pending.parentId;
      return session;
    }

    // Publish the pending entry before preparation checks its cancellation token.
    const registration: Promise<BrowserSession> = Promise.resolve().then(() =>
      this.createBrowserSession(
        taskId,
        parentId,
        stream,
        () => this.pending.get(taskId)?.promise === registration,
      ),
    );
    const entry = { parentId, promise: registration };
    this.pending.set(taskId, entry);
    try {
      const session = await registration;
      session.parentId ??= entry.parentId;
      return session;
    } finally {
      if (this.pending.get(taskId) === entry) this.pending.delete(taskId);
    }
  }

  private async createBrowserSession(
    taskId: string,
    parentId: string | undefined,
    stream: boolean | undefined,
    isCurrent: () => boolean,
  ) {
    if (!isCurrent())
      throw new Error("Browser session registration was cancelled.");
    const browserSession: BrowserSession = {
      parentId,
    };

    const enableStream = this.options.proxyStreams || stream;
    if (enableStream) {
      const port = await getAvailablePort();
      if (!isCurrent())
        throw new Error("Browser session registration was cancelled.");
      browserSession.port = port;
      browserSession.streamUrl = `ws://localhost:${port}`;
      if (this.options.proxyStreams) {
        // The extension owns the shared proxy. A browser session only owns its
        // upstream daemon and viewer connection, never the proxy server itself.
        browserSession.streamUrl = getCorsProxyUrl(
          `ws://127.0.0.1:${port}/?pacing=ack`,
        ).replace(/^http:/, "ws:");
      }
    }

    if (!isCurrent())
      throw new Error("Browser session registration was cancelled.");

    this.browserSessions.value = {
      ...this.browserSessions.value,
      [taskId]: browserSession,
    };
    logger.trace(`Registering browser session for task ${taskId}`, {
      parentId,
      port: browserSession.port,
    });
    return browserSession;
  }

  async unregisterBrowserSession(taskId: string) {
    this.pending.delete(taskId);
    // Cleanup agent-browser process
    const envs = this.getAgentBrowserEnvs(taskId);
    if (envs) {
      const child = spawn(
        existsSync(agentBrowserPath) ? agentBrowserPath : "agent-browser",
        ["close"],
        {
          env: {
            ...process.env,
            ...envs,
          },
          detached: true,
          stdio: "ignore",
        },
      );
      child.on("error", (error) =>
        logger.error("Failed to close browser session", error),
      );
      child.unref();
    }

    const { [taskId]: browserSession, ...rest } = this.browserSessions.value;
    this.browserSessions.value = rest;
    logger.trace(`Unregistering browser session for task ${taskId}`, {
      parentId: browserSession?.parentId,
    });
  }

  async unregisterSubtaskBrowserSessions(taskId: string) {
    const ids = new Set(
      Object.entries(this.browserSessions.value)
        .filter(([_, session]) => session.parentId === taskId)
        .map(([id]) => id),
    );
    for (const [id, pending] of this.pending) {
      if (pending.parentId === taskId) ids.add(id);
    }

    for (const id of ids) {
      await this.unregisterBrowserSession(id);
    }
    logger.trace(`Unregistering subtask browser sessions for task ${taskId}`, [
      ...ids,
    ]);
  }

  getAgentBrowserEnvs(taskId: string): Record<string, string> | undefined {
    const envs: Record<string, string> = {};

    const browserSession = this.browserSessions.value[taskId];
    if (!browserSession) {
      return undefined;
    }

    envs.AGENT_BROWSER_SESSION = taskId;
    // Match the agent's on-demand install location, including in existing shells.
    envs.PATH = `${agentBrowserBinDir}${path.delimiter}${process.env.PATH || ""}`;
    // Pochi owns session cleanup; preserve sessions while a task awaits the user.
    envs.AGENT_BROWSER_IDLE_TIMEOUT_MS =
      process.env.AGENT_BROWSER_IDLE_TIMEOUT_MS ?? "0";

    // If we are in VSCode environment, we need to enable the websocket
    if (browserSession.port) {
      envs.AGENT_BROWSER_STREAM_PORT = String(browserSession.port);
    }

    logger.trace(`Getting agent browser envs for task ${taskId}`, envs);
    return envs;
  }
}
