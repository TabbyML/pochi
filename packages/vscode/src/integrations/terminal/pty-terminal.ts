import * as vscode from "vscode";
import type { PtyProcess } from "./pty-process";

export class PtyTerminal implements vscode.Pseudoterminal, vscode.Disposable {
  private readonly writeEmitter = new vscode.EventEmitter<string>();
  private readonly closeEmitter = new vscode.EventEmitter<number | undefined>();
  private readonly disposables: vscode.Disposable[] = [];
  private readonly pendingOutput: string[] = [];
  private opened = false;
  private exited = false;
  private disposed = false;

  readonly onDidWrite = this.writeEmitter.event;
  readonly onDidClose = this.closeEmitter.event;

  constructor(
    private readonly ptyProcess: PtyProcess,
    private readonly onCloseRequested: () => void,
  ) {
    const subscription = ptyProcess.subscribeWithReplay((data) => {
      if (this.opened) {
        this.writeEmitter.fire(data);
      } else {
        this.pendingOutput.push(data);
      }
    });
    this.pendingOutput.unshift(...subscription.replay);
    this.disposables.push(subscription.disposable);
    this.disposables.push(
      ptyProcess.onExit(({ exitCode }) => {
        if (this.exited) return;
        this.exited = true;
        this.closeEmitter.fire(exitCode);
      }),
    );
  }

  open(): void {
    if (this.opened) return;
    this.opened = true;
    for (const data of this.pendingOutput.splice(0)) {
      this.writeEmitter.fire(data);
    }
  }

  close(): void {
    this.opened = false;
    if (!this.exited) {
      this.onCloseRequested();
    }
    this.dispose();
  }

  handleInput(data: string): void {
    this.ptyProcess.write(data);
  }

  setDimensions(dimensions: vscode.TerminalDimensions): void {
    this.ptyProcess.resize(dimensions.columns, dimensions.rows);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.writeEmitter.dispose();
    this.closeEmitter.dispose();
  }
}
