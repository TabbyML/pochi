import type { LanguageModelV2Prompt } from "@ai-sdk/provider";
import { getLogger } from "@getpochi/common";
import type {
  VSCodeLmModel,
  VSCodeLmRequest,
} from "@getpochi/common/vscode-webui-bridge";
import { signal } from "@preact/signals-core";
import { ThreadAbortSignal } from "@quilted/threads";
import { injectable, singleton } from "tsyringe";
import * as vscode from "vscode";

const logger = getLogger("VSCodeLm");

const isVSCodeIDE = () => {
  return ["vscode", "vscode-insider"].includes(vscode.env.uriScheme);
};

@injectable()
@singleton()
export class VSCodeLm implements vscode.Disposable {
  featureAvailable = isVSCodeIDE();

  private disposables: vscode.Disposable[] = [];

  readonly models = signal<VSCodeLmModel[]>([]);

  constructor() {
    if (this.featureAvailable) {
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

  private async updateModels() {
    if (!this.featureAvailable) {
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

  chat: VSCodeLmRequest = async (
    { model, prompt, abortSignal, stopSequences },
    onChunk,
  ) => {
    const vscodeModels = await vscode.lm.selectChatModels(model);
    if (vscodeModels.length === 0) {
      throw new Error("No suitable VSCode model found");
    }
    if (vscodeModels.length > 1) {
      throw new Error("Multiple suitable VSCode models found");
    }
    const [vscodeModel] = vscodeModels;

    // Only first stop words is used.
    const stop = stopSequences?.[0];

    const signal = new ThreadAbortSignal(abortSignal);
    const cancel = cancellationSourceFromAbortSignal(signal);
    try {
      const vscodeMessages = toVSCodeMessage(prompt);
      logger.debug("Sending VSCode LM request");
      const response = await vscodeModel.sendRequest(
        vscodeMessages,
        undefined,
        cancel.token,
      );

      let buffer = "";
      for await (const chunk of response.text) {
        if (signal.aborted) {
          logger.info("VSCode LM request aborted");
          break;
        }

        buffer += chunk;
        if (stop) {
          const index = buffer.indexOf(stop);
          if (index > 0) {
            logger.debug("VSCode LM request stopped by stop word");
            // Stop words found.
            onChunk(buffer.slice(0, index));
            break;
          }

          if (index < 0) {
            const endIndex = getPotentialStartIndex(buffer, stop);
            if (endIndex === null) {
              onChunk(buffer);
              buffer = "";
              continue;
            }

            onChunk(buffer.slice(0, endIndex));
            buffer = buffer.slice(endIndex);
          }
        }
      }
    } catch (error) {
      if (error instanceof vscode.LanguageModelError) {
        logger.error(
          `VSCode LM request failed: ${error.message} ${error.code} ${error.cause}`,
        );
      } else {
        logger.error("Failed to send VSCode LM request", error);
      }
    } finally {
      cancel.dispose();
    }
    logger.debug("Finish VSCode LM request");
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
              return undefined;
            })
            .filter((x) => !!x),
        );
      }
      // VSCode don't support system message
      if (message.role === "system") {
        return vscode.LanguageModelChatMessage.User(message.content);
      }
      return undefined;
    })
    .filter((x) => x !== undefined);
}

function cancellationSourceFromAbortSignal(abortSignal: AbortSignal) {
  const cancellationTokenSource = new vscode.CancellationTokenSource();
  abortSignal.addEventListener("abort", () => {
    cancellationTokenSource.cancel();
  });
  return cancellationTokenSource;
}

function getPotentialStartIndex(
  text: string,
  searchedText: string,
): number | null {
  // Return null immediately if searchedText is empty.
  if (searchedText.length === 0) {
    return null;
  }

  // Check if the searchedText exists as a direct substring of text.
  const directIndex = text.indexOf(searchedText);
  if (directIndex !== -1) {
    return directIndex;
  }

  // Otherwise, look for the largest suffix of "text" that matches
  // a prefix of "searchedText". We go from the end of text inward.
  for (let i = text.length - 1; i >= 0; i--) {
    const suffix = text.substring(i);
    if (searchedText.startsWith(suffix)) {
      return i;
    }
  }

  return null;
}
