import type { LanguageModelV2Prompt } from "@ai-sdk/provider";
import { getLogger } from "@getpochi/common";
import type {
  VSCodeLmModel,
  VSCodeLmRequest,
} from "@getpochi/common/vscode-webui-bridge";
import { signal } from "@preact/signals-core";
import { injectable, singleton } from "tsyringe";
import * as vscode from "vscode";
// biome-ignore lint/style/useImportType: needed for dependency injection
import { PochiConfiguration, updateVscodeLmEnabled } from "./configuration";

const logger = getLogger("VSCodeLm");

const isVSCodeIDE = () => {
  return ["vscode", "vscode-insider"].includes(vscode.env.uriScheme);
};
@injectable()
@singleton()
export class VSCodeLm implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];

  readonly models = signal<VSCodeLmModel[]>([]);

  constructor(private readonly config: PochiConfiguration) {
    if (this.config.vscodeLmEnabled.value && isVSCodeIDE()) {
      this.initModels();
    }
  }

  private initModels() {
    this.disposables.push(
      vscode.lm.onDidChangeChatModels(() => {
        this.updateModels();
      }),
    );
    this.updateModels();
  }

  toggle() {
    if (!isVSCodeIDE()) {
      return;
    }
    const enabled = !this.config.vscodeLmEnabled.value;
    updateVscodeLmEnabled(enabled).then(() => {
      if (enabled) {
        this.initModels();
      } else {
        this.models.value = [];
      }
    });
  }

  private async updateModels() {
    if (!this.config.vscodeLmEnabled.value) {
      return;
    }
    try {
      const vscodeModels = await vscode.lm.selectChatModels({});
      this.models.value = vscodeModels
        .filter((item) =>
          ["claude-sonnet-4", "gemini-2.5-pro"].includes(item.id),
        )
        .map<VSCodeLmModel>((item) => ({
          vendor: item.vendor,
          family: item.family,
          version: item.version,
          id: item.id,
          contextWindow: item.maxInputTokens,
        }));
    } catch (error) {
      logger.error("Failed to update VSCode models", error);
    }
  }

  request: VSCodeLmRequest = async ({ model, messages }, onChunk) => {
    logger.info("vscode lm request");
    const vscodeModels = await vscode.lm.selectChatModels(model);
    if (vscodeModels.length === 0) {
      throw new Error("No suitable VSCode model found");
    }
    if (vscodeModels.length > 1) {
      throw new Error("Multiple suitable VSCode models found");
    }
    const [vscodeModel] = vscodeModels;
    logger.info(`vscode lm request ${vscodeModel.id}`);

    let response: vscode.LanguageModelChatResponse | undefined = undefined;
    try {
      const vscodeMessages = toVSCodeMessage(messages);
      response = await vscodeModel.sendRequest(vscodeMessages);
    } catch (error) {
      if (error instanceof vscode.LanguageModelError) {
        logger.error(
          `VSCode LM request failed: ${error.message} ${error.code} ${error.cause}`,
        );
      } else {
        logger.error("Failed to send VSCode LM request", error);
      }
    }

    for await (const chunk of response?.text ?? []) {
      await onChunk(chunk);
    }

    logger.info("vscode lm request success");
  };

  dispose() {
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}

function toVSCodeMessage(
  messages: LanguageModelV2Prompt,
): vscode.LanguageModelChatMessage[] {
  return messages
    .map((message) => {
      if (message.role === "user") {
        return vscode.LanguageModelChatMessage.User(
          message.content
            .map((part) => {
              return part.type === "text"
                ? new vscode.LanguageModelTextPart(part.text)
                : undefined;
            })
            .filter((x) => !!x),
        );
      }
      if (message.role === "assistant") {
        return vscode.LanguageModelChatMessage.Assistant(
          message.content
            .map((part) => {
              if (part.type === "text") {
                return new vscode.LanguageModelTextPart(part.text);
              }
              if (part.type === "tool-call") {
                return new vscode.LanguageModelToolCallPart(
                  part.toolCallId,
                  part.toolName,
                  part.input as object,
                );
              }
              return undefined;
            })
            .filter((x) => !!x),
        );
      }
      // VSCode don't support system message
      if (message.role === "system") {
        return vscode.LanguageModelChatMessage.Assistant(message.content);
      }
      if (message.role === "tool") {
        const content = message.content.map((part) => {
          return new vscode.LanguageModelToolResultPart(part.toolCallId, [
            part.output.value,
          ]);
        });
        return vscode.LanguageModelChatMessage.User(content);
      }
      return undefined;
    })
    .filter((x) => x !== undefined);
}
