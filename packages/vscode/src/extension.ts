import "reflect-metadata";
// FIXME(wei): required for vscode version <= 1.100, update vscode version to remove this polyfill
import "iterator-helpers-polyfill";

import RagdollUriHandler from "@/integrations/uri-handler";
import { RagdollWebviewProvider } from "@/integrations/webview/ragdoll-webview-provider";
import { container, instanceCachingFactory } from "tsyringe";
import type * as vscode from "vscode";
import { CompletionProvider } from "./code-completion";
import { PochiAuthenticationProvider } from "./integrations/auth-provider";
import { CommandManager } from "./integrations/command";
import { DiffChangesContentProvider } from "./integrations/editor/diff-changes-content-provider";
import { DiffOriginContentProvider } from "./integrations/editor/diff-origin-content-provider";
import { McpHub } from "./integrations/mcp/mcp-hub";
import { StatusBarItem } from "./integrations/status-bar-item";
import { TerminalLinkProvider } from "./integrations/terminal-link-provider";
import { VSCodeLmProvider } from "./integrations/vscode-lm-provider";
import {
  type ApiClient,
  type AuthClient,
  createApiClient,
  createAuthClient,
} from "./lib/auth-client";
import { FileLogger } from "./lib/file-logger";
import { PostInstallActions } from "./lib/post-install-actions";
import { TokenStorage } from "./lib/token-storage";

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
  // Container will dispose all the registered instances when itself is disposed
  context.subscriptions.push(container);
  await container.resolve(TokenStorage).init();

  container.register<vscode.ExtensionContext>("vscode.ExtensionContext", {
    useValue: context,
  });
  container.register<AuthClient>("AuthClient", {
    // AuthClient is also a singleton
    useFactory: instanceCachingFactory(createAuthClient),
  });
  container.register<ApiClient>("ApiClient", {
    // ApiClient is also a singleton
    useFactory: instanceCachingFactory(createApiClient),
  });

  container.resolve(CompletionProvider);
  container.resolve(StatusBarItem);
  container.resolve(PochiAuthenticationProvider);
  container.resolve(RagdollWebviewProvider);
  container.resolve(RagdollUriHandler);
  container.resolve(CommandManager);
  container.resolve(DiffOriginContentProvider);
  container.resolve(McpHub);
  container.resolve(PostInstallActions);
  container.resolve(FileLogger);
  container.resolve(TerminalLinkProvider);
  container.resolve(DiffChangesContentProvider);
  container.resolve(VSCodeLmProvider);
}

// This method is called when your extension is deactivated
export function deactivate() {}
