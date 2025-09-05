import { signal } from "@preact/signals-core";
import { injectable, singleton } from "tsyringe";
import * as vscode from "vscode";
import { TerminalJob } from "./terminal-job";
export interface TerminalInfo {
  name: string;
  isActive: boolean;
  backgroundJobId?: string;
}

@injectable()
@singleton()
export class TerminalState implements vscode.Disposable {
  // Signal containing the current active terminals
  visibleTerminals = signal(listVisibleTerminals());

  private disposables: vscode.Disposable[] = [];

  constructor() {
    this.setupEventListeners();
  }

  public openBackgroundJobTerminal(backgroundJobId: string) {
    const terminal = vscode.window.terminals.find((t) => {
      const job = TerminalJob.get(t);
      return job?.id === backgroundJobId;
    });
    if (!terminal) return;
    terminal.show();
  }

  /**
   * Set up listeners for terminal changes
   */
  private setupEventListeners() {
    this.disposables.push(
      vscode.window.onDidChangeActiveTerminal(this.onTerminalChanged),
    );
    this.disposables.push(
      vscode.window.onDidOpenTerminal(this.onTerminalChanged),
    );
    this.disposables.push(
      vscode.window.onDidCloseTerminal(this.onTerminalChanged),
    );
    this.disposables.push(TerminalJob.onDidDispose(this.onTerminalChanged));
  }

  /**
   * Update the active terminals signal when terminals change
   */
  private onTerminalChanged = () => {
    this.visibleTerminals.value = listVisibleTerminals();
  };

  /**
   * Release all resources held by this class
   */
  dispose() {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];
  }
}

function listVisibleTerminals(): TerminalInfo[] {
  return vscode.window.terminals
    .filter((t) => {
      if ("hideFromUser" in t.creationOptions) {
        return !t.creationOptions.hideFromUser;
      }
      return true;
    })
    .map((t) => ({
      name: t.name || "Unnamed Terminal",
      isActive: t === vscode.window.activeTerminal,
      backgroundJobId: TerminalJob.get(t)?.id,
    }));
}
