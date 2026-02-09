// biome-ignore lint/style/useImportType: needed for initialization
import { AuthEvents } from "@/lib/auth-events";
// biome-ignore lint/style/useImportType: needed for initialization
import { TabCompletionManager } from "@/tab-completion";
import { signal } from "@preact/signals-core";
import { injectable, singleton } from "tsyringe";
import * as vscode from "vscode";
// biome-ignore lint/style/useImportType: needed for initialization
import { PochiConfiguration } from "./configuration";

@injectable()
@singleton()
export class StatusBarItem implements vscode.Disposable {
  private readonly statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100,
  );

  private disposables: vscode.Disposable[] = [];
  readonly status = signal<
    | "initializing"
    | "logged-out"
    | "disabled"
    | "disabled-language"
    | "conflict-detected"
    | "ready"
    | "loading"
    | "error"
  >("initializing");

  constructor(
    private readonly pochiConfiguration: PochiConfiguration,
    private readonly authEvents: AuthEvents,
    private readonly tabCompletionManager: TabCompletionManager,
  ) {
    this.initialize();
  }

  private initialize() {
    this.disposables.push(this.statusBarItem);

    this.update();

    this.disposables.push(
      {
        dispose: this.pochiConfiguration.advancedSettings.subscribe(() => {
          this.update();
        }),
      },
      {
        dispose:
          this.pochiConfiguration.githubCopilotCodeCompletionEnabled.subscribe(
            () => {
              this.update();
            },
          ),
      },
      {
        dispose: this.authEvents.isLoggedIn.subscribe(() => {
          this.update();
        }),
      },
      {
        dispose: this.tabCompletionManager.isFetching.subscribe(() => {
          this.update();
        }),
      },
      vscode.window.onDidChangeActiveTextEditor(() => {
        this.update();
      }),
      {
        dispose: this.status.subscribe((status) => {
          this.updateVisibility(status);
          this.renderStatus(status);
        }),
      },
    );
  }

  private update() {
    this.status.value = this.calculateStatus();
  }

  private calculateStatus() {
    if (this.authEvents.isLoggedIn.value === undefined) {
      return "initializing";
    }
    if (this.authEvents.isLoggedIn.value === false) {
      return "logged-out";
    }

    const tabCompletionConfig =
      this.pochiConfiguration.advancedSettings.value.tabCompletion;

    if (tabCompletionConfig?.disabled) {
      return "disabled";
    }

    if (
      vscode.window.activeTextEditor &&
      this.pochiConfiguration.advancedSettings.value.tabCompletion?.disabledLanguages?.includes(
        vscode.window.activeTextEditor.document.languageId,
      )
    ) {
      return "disabled-language";
    }

    if (this.pochiConfiguration.githubCopilotCodeCompletionEnabled.value) {
      return "conflict-detected";
    }

    if (this.tabCompletionManager.isFetching.value) {
      return "loading";
    }

    if (this.tabCompletionManager.error.value) {
      return "error";
    }

    return "ready";
  }

  private updateVisibility(status: StatusBarItem["status"]["value"]) {
    if (status === "logged-out") {
      this.statusBarItem.hide();
    } else {
      this.statusBarItem.show();
    }
  }

  private renderStatus(status: StatusBarItem["status"]["value"]) {
    switch (status) {
      case "initializing":
        this.statusBarItem.text = "$(loading~spin) Pochi";
        this.statusBarItem.tooltip = "Initializing...";
        this.statusBarItem.backgroundColor = undefined;
        this.statusBarItem.command = undefined;
        break;

      case "logged-out":
        this.statusBarItem.text = "$(warning) Pochi";
        this.statusBarItem.tooltip = "Please sign in to use Tab Completion.";
        this.statusBarItem.backgroundColor = new vscode.ThemeColor(
          "statusBarItem.warningBackground",
        );
        this.statusBarItem.command = "pochi.openLoginPage";
        break;

      case "disabled":
        this.statusBarItem.text = "$(dash) Pochi";
        this.statusBarItem.tooltip = "Tab Completion is disabled.";
        this.statusBarItem.backgroundColor = undefined;
        this.statusBarItem.command = "pochi.tabCompletion.toggleEnabled";
        break;

      case "disabled-language":
        this.statusBarItem.text = "$(dash) Pochi";
        this.statusBarItem.tooltip = `Tab completion is disabled for ${vscode.window.activeTextEditor?.document.languageId ?? "current language"}.`;
        this.statusBarItem.backgroundColor = undefined;
        this.statusBarItem.command =
          "pochi.tabCompletion.toggleLanguageEnabled";
        break;

      case "conflict-detected":
        this.statusBarItem.text = "$(warning) Pochi";
        this.statusBarItem.tooltip =
          "Tab Completion is not available due to conflict with GitHub Copilot Code Completion.";
        this.statusBarItem.backgroundColor = undefined;
        this.statusBarItem.command = "pochi.tabCompletion.resolveConflicts";
        break;

      case "loading":
        this.statusBarItem.text = "$(loading~spin) Pochi";
        this.statusBarItem.tooltip = "Generating a completion...";
        this.statusBarItem.backgroundColor = undefined;
        this.statusBarItem.command = undefined;
        break;

      case "error":
        this.statusBarItem.text = "$(warning) Pochi";
        this.statusBarItem.tooltip = this.tabCompletionManager.error.value;
        this.statusBarItem.backgroundColor = undefined;
        this.statusBarItem.command = undefined;
        break;

      case "ready":
        this.statusBarItem.text = "$(check) Pochi";
        this.statusBarItem.tooltip = "Tab Completion is enabled.";
        this.statusBarItem.backgroundColor = undefined;
        this.statusBarItem.command = "pochi.tabCompletion.toggleEnabled";
        break;
    }
  }

  dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];
  }
}
