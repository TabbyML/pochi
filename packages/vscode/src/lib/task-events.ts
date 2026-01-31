import * as vscode from "vscode";

export const taskUpdated = new vscode.EventEmitter<{ event: unknown }>();
export const taskRunning = new vscode.EventEmitter<{ taskId: string }>();
export const taskPendingApproval = new vscode.EventEmitter<{
  taskId: string;
}>();

/** Fired when a file is saved in a task's workspace */
export const taskFileChanged = new vscode.EventEmitter<{
  taskId: string;
  filepath: string;
  content: string;
}>();
