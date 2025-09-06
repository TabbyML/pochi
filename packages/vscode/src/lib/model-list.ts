// biome-ignore lint/style/useImportType: needed for dependency injection
import { VSCodeLm } from "@/integrations/vscode-lm";
import { getLogger } from "@getpochi/common";
import { pochiConfig } from "@getpochi/common/configuration";
import { getVendors } from "@getpochi/common/vendor";
import type {
  DisplayModel,
  VSCodeLmRequestOptions,
} from "@getpochi/common/vscode-webui-bridge";
import { type Signal, effect, signal } from "@preact/signals-core";
import { injectable, singleton } from "tsyringe";
import type * as vscode from "vscode";

const logger = getLogger("ModelList");

@injectable()
@singleton()
export class ModelList implements vscode.Disposable {
  dispose() {}

  readonly modelList: Signal<DisplayModel[]> = signal([]);

  constructor(private readonly vscodeLm: VSCodeLm) {
    effect(() => {
      // Explicitly depend on the config to trigger the effect
      if (
        pochiConfig.value.providers ||
        pochiConfig.value.vendors ||
        this.vscodeLm.models.value.length > 0
      ) {
        this.fetchModelList().then((models) => {
          this.modelList.value = models;
        });
      }
    });
  }

  private async fetchModelList(): Promise<DisplayModel[]> {
    const modelList: DisplayModel[] = [];

    // From VSCodeLM
    for (const x of this.vscodeLm.models.value) {
      const vendorId = "vscode-lm";
      const modelId = JSON.stringify(x);
      modelList.push({
        type: "vendor",
        vendorId,
        id: `${vendorId}/${x.vendor}/${x.id}`,
        name: `${x.vendor}/${x.id}`,
        modelId,
        options: {
          contextWindow: x.contextWindow,
          useToolCallMiddleware: true,
        },
        // This is a hack to pass the model to the chat function
        getCredentials: async () => {
          return async (
            options: Omit<VSCodeLmRequestOptions, "model">,
            onChunk: (chunk: string) => Promise<void>,
          ) => {
            await this.vscodeLm.chat(
              {
                ...options,
                model: x,
              },
              onChunk,
            );
          };
        },
      });
    }

    const vendors = getVendors();

    // From vendors
    for (const [vendorId, vendor] of Object.entries(vendors)) {
      if (vendor.authenticated) {
        try {
          const models = await vendor.fetchModels();
          for (const [modelId, options] of Object.entries(models)) {
            modelList.push({
              type: "vendor",
              name: vendorId === "pochi" ? modelId : `${vendorId}/${modelId}`,
              vendorId,
              id: `${vendorId}/${modelId}`,
              modelId,
              options,
              getCredentials: vendor.getCredentials,
            });
          }
        } catch (e) {
          logger.error(`Failed to fetch models for vendor ${vendorId}:`, e);
        }
      }
    }

    // From configuration providers
    const providers = pochiConfig.value.providers;
    if (providers) {
      for (const [providerId, provider] of Object.entries(providers)) {
        const { models, name: providerName, ...rest } = provider;
        if (models) {
          for (const [
            modelId,
            { name: modelName, ...options },
          ] of Object.entries(models)) {
            const name = `${providerName ?? providerId}/${modelName ?? modelId}`;
            modelList.push({
              id: `${providerId}/${modelId}`,
              type: "provider",
              name,
              modelId,
              options,
              provider: rest,
            });
          }
        }
      }
    }

    return modelList;
  }
}
