import { getLogger } from "@getpochi/common";
import { signal } from "@preact/signals-core";
import { inject, injectable, singleton } from "tsyringe";
import type * as vscode from "vscode";

const logger = getLogger("lang");

@injectable()
@singleton()
export class Lang {
  currentLang = signal<string>("en");

  private readonly storageKey = "pochi-lang";

  constructor(
    @inject("vscode.ExtensionContext")
    private readonly context: vscode.ExtensionContext,
  ) {
    this.currentLang.value = this.context.globalState.get(
      this.storageKey,
      "en",
    );
  }

  updateLang = async (lang: string) => {
    logger.info(`Updating language from ${this.currentLang.value} to ${lang}`);
    await this.context.globalState.update(this.storageKey, lang);
    this.currentLang.value = lang;
  };
}
