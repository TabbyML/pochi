import { getLogger } from "@/lib/logger";
import { injectable, singleton } from "tsyringe";
import type * as vscode from "vscode";
// biome-ignore lint/style/useImportType:
import { PochiConfiguration } from "../../integrations/configuration";
import type { NESContextSegments } from "../contexts";
import type { NESResponseItem } from "../types";
import { NESGoogleVertexTuningClient } from "./google-vertex-tuning";
import type { NESClientProvider, ProviderConfig } from "./type";

const logger = getLogger("NES.Client");

function createTimeOutSignal(): AbortSignal {
  return AbortSignal.timeout(60 * 1000); // default timeout 60s
}

@injectable()
@singleton()
export class NESClient {
  private provider: NESClientProvider | undefined;

  constructor(private readonly pochiConfiguration: PochiConfiguration) {
    this.provider = this.createProvider(
      pochiConfiguration.advancedSettings.value.nextEditSuggestion?.provider,
    );
    this.pochiConfiguration.advancedSettings.subscribe((value) => {
      this.provider = this.createProvider(value.nextEditSuggestion?.provider);
    });
  }

  private createProvider(
    providerConfig: ProviderConfig | undefined,
  ): NESClientProvider | undefined {
    if (providerConfig?.type === "google-vertex-tuning") {
      logger.debug(
        "Using Google Vertex Tuning next edit suggestion provider: ",
        providerConfig,
      );
      return new NESGoogleVertexTuningClient(providerConfig);
    }
    return undefined;
  }

  async fetchCompletion(
    segments: NESContextSegments,
    token?: vscode.CancellationToken | undefined,
  ): Promise<NESResponseItem | undefined> {
    if (!this.provider) {
      return undefined;
    }

    const signals = [createTimeOutSignal()];
    if (token) {
      const abortController = new AbortController();
      if (token.isCancellationRequested) {
        abortController.abort();
      }
      token.onCancellationRequested(() => abortController.abort());
      signals.push(abortController.signal);
    }
    const combinedSignal = AbortSignal.any(signals);

    return await this.provider.fetchCompletion({
      segments,
      abortSignal: combinedSignal,
    });
  }
}
