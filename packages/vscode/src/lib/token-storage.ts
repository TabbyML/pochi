import { updatePochiConfig } from "@getpochi/common/configuration";
import { getPochiCredentials } from "@getpochi/vendor-pochi";
import { computed } from "@preact/signals-core";
import { injectable, singleton } from "tsyringe";
import type * as vscode from "vscode";

@injectable()
@singleton()
export class TokenStorage implements vscode.Disposable {
  token = computed(() => getPochiCredentials()?.token);
  dispose: () => void = () => {};

  setToken(token: string | undefined) {
    updatePochiConfig({
      vendors: {
        pochi: token
          ? {
              credentials: {
                token,
              },
            }
          : null,
      },
    });
  }
}
