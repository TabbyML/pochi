import { injectable, singleton } from "tsyringe";
import * as vscode from "vscode";
// biome-ignore lint/style/useImportType: needed for dependency injection
import { PochiConfiguration } from "./configuration";
// biome-ignore lint/style/useImportType: needed for dependency injection
import { StatusBarItem } from "./status-bar-item";

interface QuickPickItem extends vscode.QuickPickItem {
  onDidAccept?: () => void;
}

// FIXME(zhiming): CommandPalette is not used for now, consider removing it.
@injectable()
@singleton()
export class CommandPalette {
  constructor(
    private readonly statusBarItem: StatusBarItem,
    private readonly pochiConfiguration: PochiConfiguration,
  ) {}

  async show() {
    return new Promise<QuickPickItem | undefined>((resolve) => {
      const quickPick = vscode.window.createQuickPick<QuickPickItem>();
      quickPick.title = "Pochi Command Palette";
      quickPick.placeholder = "Select an action";
      const status = this.statusBarItem.status.value;

      const items = [
        this.buildStatusItem(status),
        {
          label: "",
          kind: vscode.QuickPickItemKind.Separator,
        },
        {
          label: "Chat",
          iconPath: new vscode.ThemeIcon("comment"),
          onDidAccept: () => {
            vscode.commands.executeCommand("pochiSidebar.focus");
          },
        },
        {
          label: "",
          kind: vscode.QuickPickItemKind.Separator,
        },
        {
          label: this.pochiConfiguration.advancedSettings.value.inlineCompletion
            ?.disabled
            ? "Enable Code Completion"
            : "Disable Code Completion",
          onDidAccept: () => {
            vscode.commands.executeCommand(
              "pochi.inlineCompletion.toggleEnabled",
            );
          },
        },
      ];

      const language = vscode.window.activeTextEditor?.document.languageId;
      if (language) {
        items.push({
          label:
            this.pochiConfiguration.advancedSettings.value.inlineCompletion?.disabledLanguages?.includes(
              language,
            )
              ? `Enable Code Completion for "${language}"`
              : `Disable Code Completion for "${language}"`,
          onDidAccept: () => {
            vscode.commands.executeCommand(
              "pochi.inlineCompletion.toggleLanguageEnabled",
              language,
            );
          },
        });
      }

      items.push(
        {
          label: "",
          kind: vscode.QuickPickItemKind.Separator,
        },
        {
          label: "Settings",
          iconPath: new vscode.ThemeIcon("settings"),
          onDidAccept: () => {
            vscode.commands.executeCommand("pochi.openSettings");
          },
        },
        {
          label: "Show Logs",
          iconPath: new vscode.ThemeIcon("output"),
          onDidAccept: () => {
            vscode.commands.executeCommand("pochi.outputPanel.focus");
          },
        },
      );

      quickPick.items = items;
      const unsubscribe = this.statusBarItem.status.subscribe((status) => {
        quickPick.items = [this.buildStatusItem(status), ...items.slice(1)];
      });

      quickPick.onDidAccept(() => {
        const selected = quickPick.selectedItems[0];
        selected?.onDidAccept?.();
        resolve(selected);
        quickPick.hide();
      });

      quickPick.onDidHide(() => {
        unsubscribe();
        quickPick.dispose();
        resolve(undefined);
      });

      quickPick.show();
    });
  }

  private buildStatusItem(
    status: StatusBarItem["status"]["value"],
  ): QuickPickItem {
    switch (status) {
      case "initializing":
        return {
          label: "$(loading~spin) Initializing...",
        };

      case "logged-out":
        return {
          label: "Sign In",
          onDidAccept: () => {
            vscode.commands.executeCommand("pochi.openLoginPage");
          },
        };

      case "payment-required":
        return {
          label: "Payment",
          iconPath: new vscode.ThemeIcon("account"),
          detail:
            "Your freebie usage has been rate limited. Consider upgrading your subscription.",
          onDidAccept: () => {
            vscode.commands.executeCommand("pochi.openWebsite", "/profile");
          },
        };

      case "disabled":
        return {
          label: "Code Completion Disabled",
          iconPath: new vscode.ThemeIcon("dash"),
          description: "Click to enable",
          onDidAccept: () => {
            vscode.commands.executeCommand(
              "pochi.inlineCompletion.toggleEnabled",
            );
          },
        };

      case "disabled-language": {
        const language = vscode.window.activeTextEditor?.document.languageId;
        return {
          label: `Code Completion Disabled${language ? ` for "${language}"` : ""}`,
          iconPath: new vscode.ThemeIcon("dash"),
          description: "Click to enable",
          onDidAccept: () => {
            vscode.commands.executeCommand(
              "pochi.inlineCompletion.toggleLanguageEnabled",
              language,
            );
          },
        };
      }

      case "loading":
      case "ready":
        return {
          label: "Ready",
          iconPath: new vscode.ThemeIcon("check"),
        };
    }
  }
}
