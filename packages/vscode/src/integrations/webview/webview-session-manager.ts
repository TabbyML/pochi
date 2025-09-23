import { getLogger } from "@getpochi/common";
import type { SessionState } from "@getpochi/common/vscode-webui-bridge";
import { injectable, singleton } from "tsyringe";
import * as vscode from "vscode";

const logger = getLogger("WebviewSessionManager");

export interface WebviewSession {
  id: string;
  state: SessionState;
  type: "sidebar" | "editor";
  createdAt: Date;
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
  private _onSessionCreated = new vscode.EventEmitter<string>();
  private _onSessionDestroyed = new vscode.EventEmitter<string>();

  public readonly onSessionCreated = this._onSessionCreated.event;
  public readonly onSessionDestroyed = this._onSessionDestroyed.event;

  createSession(id: string, type: "sidebar" | "editor"): WebviewSession {
    if (this.sessions.has(id)) {
      logger.warn(`Session ${id} already exists, replacing it`);
    }

    const session: WebviewSession = {
      id,
      state: {},
      type,
      createdAt: new Date(),
    };

    this.sessions.set(id, session);
    this._onSessionCreated.fire(id);
    logger.info(`Created ${type} session: ${id}`);

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
      this._onSessionDestroyed.fire(id);
      logger.info(`Removed session: ${id}`);
    }
  }

  dispose(): void {
    this.sessions.clear();
    this._onSessionCreated.dispose();
    this._onSessionDestroyed.dispose();
  }
}
