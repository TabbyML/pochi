// biome-ignore lint/style/useImportType: needed for initialization
import { CompletionProvider } from "@/code-completion";
// biome-ignore lint/style/useImportType: needed for initialization
import { AuthEvents } from "@/lib/auth-events";
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
    | "ready"
    | "loading"
  >("initializing");

  constructor(
    private readonly pochiConfiguration: PochiConfiguration,
    private readonly authEvents: AuthEvents,
    private readonly inlineCompletionProvider: CompletionProvider,
  ) {
    this.initialize();
  }

  private initialize() {
    this.disposables.push(this.statusBarItem);

    this.update();

    this.disposables.push({
      dispose: this.pochiConfiguration.advancedSettings.subscribe(() => {
        this.update();
      }),
    });
    this.disposables.push({
      dispose: this.authEvents.isLoggedIn.subscribe(() => {
        this.update();
      }),
    });
    this.disposables.push({
      dispose: this.inlineCompletionProvider.isFetching.subscribe(() => {
        this.update();
      }),
    });
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor(() => {
        this.update();
      }),
    );
    this.disposables.push({
      dispose: this.status.subscribe((status) => {
        this.updateVisibility(status);
        this.renderStatus(status);
      }),
    });
  }

  private update() {
    this.status.value = this.calcStatus();
  }

  private calcStatus() {
    if (this.authEvents.isLoggedIn.value === undefined) {
      return "initializing";
    }
    if (this.authEvents.isLoggedIn.value === false) {
      return "logged-out";
    }
    // User logged-in

    if (
      this.pochiConfiguration.advancedSettings.value.inlineCompletion?.disabled
    ) {
      return "disabled";
    }
    if (
      vscode.window.activeTextEditor &&
      this.pochiConfiguration.advancedSettings.value.inlineCompletion?.disabledLanguages?.includes(
        vscode.window.activeTextEditor.document.languageId,
      )
    ) {
      return "disabled-language";
    }
    if (this.inlineCompletionProvider.isFetching.value) {
      return "loading";
    }
    // Normal case

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
        this.statusBarItem.tooltip = "Please sign in to use code completion.";
        this.statusBarItem.backgroundColor = new vscode.ThemeColor(
          "statusBarItem.warningBackground",
        );
        this.statusBarItem.command = "pochi.openLoginPage";
        break;

      case "disabled":
        this.statusBarItem.text = "$(dash) Pochi";
        this.statusBarItem.tooltip = "Code completion is disabled.";
        this.statusBarItem.backgroundColor = undefined;
        this.statusBarItem.command = "pochi.inlineCompletion.toggleEnabled";
        break;

      case "disabled-language":
        this.statusBarItem.text = "$(dash) Pochi";
        this.statusBarItem.tooltip = `Code completion is disabled for ${vscode.window.activeTextEditor?.document.languageId ?? "current language"}.`;
        this.statusBarItem.backgroundColor = undefined;
        this.statusBarItem.command =
          "pochi.inlineCompletion.toggleLanguageEnabled";
        break;

      case "loading":
        this.statusBarItem.text = "$(loading~spin) Pochi";
        this.statusBarItem.tooltip = "Generating a completion...";
        this.statusBarItem.backgroundColor = undefined;
        this.statusBarItem.command = undefined;
        break;

      case "ready":
        this.statusBarItem.text = "$(check) Pochi";
        this.statusBarItem.tooltip = "Code completion is enabled.";
        this.statusBarItem.backgroundColor = undefined;
        this.statusBarItem.command = "pochi.inlineCompletion.toggleEnabled";
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
