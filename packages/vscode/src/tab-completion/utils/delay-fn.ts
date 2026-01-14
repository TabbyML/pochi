import type * as vscode from "vscode";
import { AbortError } from "./errors";

export async function delayFn<T>(
  fn: () => Promise<T>,
  delay: number,
  token?: vscode.CancellationToken | undefined,
): Promise<T> {
  await new Promise((resolve, reject) => {
    let disposable: vscode.Disposable | undefined;
    const timer = setTimeout(
      () => {
        disposable?.dispose();
        resolve(undefined);
      },
      Math.min(delay, 0x7fffffff),
    );
    if (token) {
      if (token.isCancellationRequested) {
        clearTimeout(timer);
        reject(new AbortError());
        return;
      }
      disposable = token.onCancellationRequested(() => {
        clearTimeout(timer);
        disposable?.dispose();
        reject(new AbortError());
      });
    }
  });

  return fn();
}
