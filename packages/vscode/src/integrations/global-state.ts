import { signal } from "@preact/signals-core";
import { inject, injectable, singleton } from "tsyringe";
import type * as vscode from "vscode";

const RecommendSettingsConfirmedKey = "dev-recommend-settings-confirmed";

@injectable()
@singleton()
export class GlobalStateSignals implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];

  readonly recommendSettingsConfirmed = signal(false);

  constructor(
    @inject("vscode.ExtensionContext")
    private readonly context: vscode.ExtensionContext,
  ) {
    this.recommendSettingsConfirmed.value = this.getState(
      RecommendSettingsConfirmedKey,
      false,
    );
    this.disposables.push({
      dispose: this.recommendSettingsConfirmed.subscribe((value) => {
        this.setState(RecommendSettingsConfirmedKey, value);
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
