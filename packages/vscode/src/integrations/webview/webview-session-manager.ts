import { getLogger } from "@getpochi/common";
import type { SessionState } from "@getpochi/common/vscode-webui-bridge";
import { injectable, singleton } from "tsyringe";
import type * as vscode from "vscode";

const logger = getLogger("WebviewSessionManager");

export interface WebviewSession {
  id: string;
  state: SessionState;
}

/**
 * WEBVIEW SESSION MANAGER
 *
 * Manages session state for both types of webviews:
 *
 * SIDEBAR SESSIONS:
 * - Session ID: "sidebar-default"
 * - Type: "sidebar"
 * - Lifecycle: Persistent, exists while VS Code is open
 * - Managed by: RagdollWebviewProvider
 *
 * EDITOR TAB SESSIONS:
 * - Session ID: "editor-{timestamp}-{counter}"
 * - Type: "editor"
 * - Lifecycle: Created on-demand, disposed when tab is closed
 * - Managed by: PochiWebviewPanel instances
 */
@injectable()
@singleton()
export class WebviewSessionManager implements vscode.Disposable {
  private sessions = new Map<string, WebviewSession>();

  createSession(id: string): WebviewSession {
    if (this.sessions.has(id)) {
      logger.warn(`Session ${id} already exists, replacing it`);
    }

    const session: WebviewSession = {
      id,
      state: {},
    };

    this.sessions.set(id, session);

    return session;
  }

  getSessionState(id: string): SessionState | undefined {
    return this.sessions.get(id)?.state;
  }

  updateSessionState(id: string, state: Partial<SessionState>): void {
    const session = this.sessions.get(id);
    if (session) {
      Object.assign(session.state, state);
    }
  }

  removeSession(id: string): void {
    if (this.sessions.delete(id)) {
      logger.info(`Removed session: ${id}`);
    }
  }

  dispose(): void {
    this.sessions.clear();
  }
}
