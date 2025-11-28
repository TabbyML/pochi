import * as vscode from "vscode";

export const taskUpdated = new vscode.EventEmitter<{ event: unknown }>();
