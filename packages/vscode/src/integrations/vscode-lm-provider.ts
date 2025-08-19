import type { LanguageModelV2Prompt } from "@ai-sdk/provider";
import { getLogger } from "@getpochi/common";
import type {
  VSCodeLmRequest,
  VSCodeModel,
} from "@getpochi/common/vscode-webui-bridge";
import { signal } from "@preact/signals-core";
import { ThreadSignal } from "@quilted/threads/signals";
import { injectable, singleton } from "tsyringe";
import * as vscode from "vscode";

const logger = getLogger("VSCodeLmProvider");

@injectable()
@singleton()
export class VSCodeLmProvider implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];

  readonly models = signal<VSCodeModel[]>([]);

  constructor() {
    this.disposables.push(
      vscode.lm.onDidChangeChatModels(() => {
        this.updateModels();
      }),
    );
    this.updateModels();
  }

  private async updateModels() {
    try {
      const vscodeModels = await vscode.lm.selectChatModels({});
      this.models.value = vscodeModels.map<VSCodeModel>((item) => ({
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
    const vscodeMessages = toVSCodeMessage(messages);
    logger.info(`vscode lm request ${vscodeModel.id}`, vscodeMessages);

    let response: vscode.LanguageModelChatResponse | undefined = undefined;
    try {
      response = await vscodeModel.sendRequest([
        vscode.LanguageModelChatMessage.User(
          "Please share something about python",
        ),
      ]);
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
  return messages.map((message) => {
    if (message.role === "user") {
      return vscode.LanguageModelChatMessage.User(
        message.content.map((part) => {
          // VSCode user message don't support file part
          return { value: part.type === "text" ? part.text : "" };
        }),
      );
    }
    if (message.role === "assistant") {
      return vscode.LanguageModelChatMessage.Assistant(
        message.content.map((part) => {
          if (part.type === "text") {
            return { value: part.text };
          }
          if (part.type === "tool-call") {
            return {
              callId: part.toolCallId,
              name: part.toolName,
              input: part.input as object,
            };
          }
          return { value: "" };
        }),
      );
    }
    // VSCode don't support system message
    if (message.role === "system") {
      return vscode.LanguageModelChatMessage.User(message.content);
    }
    if (message.role === "tool") {
      const content = message.content.map((part) => {
        return {
          callId: part.toolCallId,
          content: [part.output.value],
        };
      });
      return vscode.LanguageModelChatMessage.User(content);
    }
    return vscode.LanguageModelChatMessage.User("");
  });
}
