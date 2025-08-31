import { pochiConfig, updatePochiConfig } from "@getpochi/common/configuration";
import { computed } from "@preact/signals-core";
import { injectable, singleton } from "tsyringe";
import type * as vscode from "vscode";

@injectable()
@singleton()
export class TokenStorage implements vscode.Disposable {
  token = computed(() => pochiConfig.value.credentials?.pochiToken);
  dispose: () => void = () => {};

  setToken(token: string | undefined) {
    updatePochiConfig({
      credentials: {
        pochiToken: token,
      },
    });
  }
}
