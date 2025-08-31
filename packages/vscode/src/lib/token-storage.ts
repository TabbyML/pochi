import { pochiConfig } from "@getpochi/common/configuration";
import { type Signal, signal } from "@preact/signals-core";
import { injectable, singleton } from "tsyringe";
import type * as vscode from "vscode";

@injectable()
@singleton()
export class TokenStorage implements vscode.Disposable {
  token: Signal<string | undefined> = signal(process.env.POCHI_SESSION_TOKEN);
  dispose: () => void = () => {};

  async init() {
    if (process.env.POCHI_SESSION_TOKEN) {
      return;
    }
    this.token.value = pochiConfig.pochiToken;
    this.dispose = this.token.subscribe(async (token) => {
      pochiConfig.pochiToken = token;
    });
  }
}
