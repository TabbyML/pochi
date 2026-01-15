import { signal } from "@preact/signals-core";
import { inject, injectable, singleton } from "tsyringe";
import type * as vscode from "vscode";

const HideRecommendSettingsKey = "dev-hide-recommend-settings";

@injectable()
@singleton()
export class GlobalStateSignals implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];

  readonly hideRecommendSettings = signal(false);

  constructor(
    @inject("vscode.ExtensionContext")
    private readonly context: vscode.ExtensionContext,
  ) {
    this.hideRecommendSettings.value = this.getState(
      HideRecommendSettingsKey,
      false,
    );
    this.disposables.push({
      dispose: this.hideRecommendSettings.subscribe((value) => {
        this.setState(HideRecommendSettingsKey, value);
      }),
    });
  }

  private setState(key: string, value: unknown) {
    this.context.globalState.update(key, value);
  }

  private getState<T>(key: string, defaultValue: T): T {
    return this.context.globalState.get(key, defaultValue);
  }

  dispose() {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];
  }
}
