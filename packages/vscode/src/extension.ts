import "reflect-metadata";
// FIXME(wei): required for vscode version <= 1.100, update vscode version to remove this polyfill
import "iterator-helpers-polyfill";

// Register the logger.
import "./lib/logger";

// Register the vendor
import "@getpochi/vendor-pochi";
import "@getpochi/vendor-gemini-cli";
import "@getpochi/vendor-claude-code";
import "@getpochi/vendor-codex";
import "@getpochi/vendor-github-copilot";
import "@getpochi/vendor-qwen-code";

import RagdollUriHandler from "@/integrations/uri-handler";
import {
  pochiConfigRelativePath,
  setPochiConfigWorkspacePath,
} from "@getpochi/common/configuration";
import { startCorsProxy } from "@getpochi/common/cors-proxy";
import { McpHub } from "@getpochi/common/mcp-utils";
import { container, instanceCachingFactory } from "tsyringe";
import * as vscode from "vscode";
import { CompletionProvider } from "./code-completion";
import { PochiAuthenticationProvider } from "./integrations/auth-provider";
import { CommandManager } from "./integrations/command";
import { DiffChangesContentProvider } from "./integrations/editor/diff-changes-content-provider";
import { DiffOriginContentProvider } from "./integrations/editor/diff-origin-content-provider";
import { WorktreeManager } from "./integrations/git/worktree";
import { initPochiLayoutKeybindingContext } from "./integrations/layout-keybinding";
import { createMcpHub } from "./integrations/mcp";
import { ReviewController } from "./integrations/review-controller";
import { StatusBarItem } from "./integrations/status-bar-item";
import { TerminalLinkProvider } from "./integrations/terminal-link-provider";
import { PochiWebviewSidebar } from "./integrations/webview";
import { PochiTaskEditorProvider } from "./integrations/webview/webview-panel";
import { type AuthClient, createAuthClient } from "./lib/auth-client";
import { FileLogger } from "./lib/file-logger";
import { getLogger } from "./lib/logger";
import { PostInstallActions } from "./lib/post-install-actions";
import { WorkspaceScope } from "./lib/workspace-scoped";
import { NESProvider } from "./nes";

const logger = getLogger("Extension");

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
  const workspaceUri = vscode.workspace.workspaceFolders?.[0].uri;
  const cwd = workspaceUri?.fsPath;

  // Initialize the Pochi layout keybinding context from VSCode configuration
  await initPochiLayoutKeybindingContext();

  // Container will dispose all the registered instances when itself is disposed
  context.subscriptions.push(container);
  context.subscriptions.push(PochiTaskEditorProvider.register(context));
  context.subscriptions.push(createWorkspaceConfigWatcher(cwd));
  if (!process.env.POCHI_TEST) {
    context.subscriptions.push(startCorsProxy());
  }

  container.register<vscode.ExtensionContext>("vscode.ExtensionContext", {
    useValue: context,
  });
  container.register<AuthClient>("AuthClient", {
    // AuthClient is also a singleton
    useFactory: instanceCachingFactory(createAuthClient),
  });

  container.register(WorkspaceScope, {
    useValue: new WorkspaceScope(cwd ?? null, workspaceUri ?? null),
  });
  container.register<McpHub>(McpHub, {
    // McpHub is also a singleton
    useFactory: instanceCachingFactory(createMcpHub),
  });
  container.resolve(PochiWebviewSidebar);
  container.resolve(CompletionProvider);
  container.resolve(NESProvider);
  container.resolve(StatusBarItem);
  container.resolve(PochiAuthenticationProvider);
  container.resolve(RagdollUriHandler);
  container.resolve(CommandManager);
  container.resolve(DiffOriginContentProvider);
  container.resolve(PostInstallActions);
  container.resolve(FileLogger);
  container.resolve(TerminalLinkProvider);
  container.resolve(DiffChangesContentProvider);
  container.resolve(WorktreeManager);
  container.resolve(ReviewController);
}

// This method is called when your extension is deactivated
export function deactivate() {}

function createWorkspaceConfigWatcher(cwd: string | undefined) {
  // Watch workspace .pochi/config.jsonc directory
  if (cwd) {
    setPochiConfigWorkspacePath(cwd);
    const workspaceConfigPattern = new vscode.RelativePattern(
      cwd,
      pochiConfigRelativePath,
    );
    const configWatcher = vscode.workspace.createFileSystemWatcher(
      workspaceConfigPattern,
    );

    configWatcher.onDidCreate(() => {
      logger.debug("Workspace configuration file created.", cwd);
      setPochiConfigWorkspacePath(cwd);
    });

    configWatcher.onDidDelete(() => {
      logger.debug("Workspace configuration file deleted.");
      setPochiConfigWorkspacePath(undefined);
    });

    return configWatcher;
  }

  return {
    dispose: () => {},
  };
}
