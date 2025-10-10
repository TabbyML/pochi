import { getLogger } from "@getpochi/common";
import {
  pochiConfig,
  watchPochiConfigKeys,
} from "@getpochi/common/configuration";
import { getVendors } from "@getpochi/common/vendor";
import type { DisplayModel } from "@getpochi/common/vscode-webui-bridge";
import { type Signal, signal } from "@preact/signals-core";
import { injectable, singleton } from "tsyringe";
import type * as vscode from "vscode";

const logger = getLogger("ModelList");

@injectable()
@singleton()
export class ModelList implements vscode.Disposable {
  dispose: () => void;
  readonly modelList: Signal<DisplayModel[]> = signal([]);

  constructor() {
    this.dispose = watchPochiConfigKeys(["providers", "vendors"], () => {
      this.fetchModelList().then((models) => {
        this.modelList.value = models;
      });
    });
  }

  private async fetchModelList(): Promise<DisplayModel[]> {
    const modelList: DisplayModel[] = [];

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
