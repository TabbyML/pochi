import * as vscode from "vscode";

export const taskUpdated = new vscode.EventEmitter<{ event: unknown }>();
export const taskRunning = new vscode.EventEmitter<{ taskId: string }>();
export const taskPendingApproval = new vscode.EventEmitter<{
  taskId: string;
}>();
