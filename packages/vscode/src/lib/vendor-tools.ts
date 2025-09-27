import { getLogger } from "@getpochi/common";
import { pochiConfig } from "@getpochi/common/configuration";
import type { McpToolExecutable } from "@getpochi/common/mcp-utils";
import { getVendors } from "@getpochi/common/vendor";
import type { McpTool } from "@getpochi/tools";
import { type Signal, effect, signal } from "@preact/signals-core";
import { injectable, singleton } from "tsyringe";
import type * as vscode from "vscode";

const logger = getLogger("VendorTools");

type VendorToolSet = Record<string, McpTool & McpToolExecutable>;

@injectable()
@singleton()
export class VendorTools implements vscode.Disposable {
  dispose() {}

  readonly tools: Signal<Record<string, VendorToolSet>> = signal({});

  constructor() {
    effect(() => {
      // Explicitly depend on the config to trigger the effect
      if (pochiConfig.value.vendors) {
        this.fetchTools().then((tools) => {
          this.tools.value = tools;
        });
      }
    });
  }

  private async fetchTools(): Promise<Record<string, VendorToolSet>> {
    const toolsets: Record<string, VendorToolSet> = {};

    const vendors = getVendors();
    // From vendors
    for (const [vendorId, vendor] of Object.entries(vendors)) {
      if (vendor.authenticated) {
        try {
          const tools = await vendor.getTools();
          if (Object.keys(tools).length > 0) {
            toolsets[vendorId] = tools;
          }
        } catch (e) {
          logger.error(`Failed to fetch models for vendor ${vendorId}:`, e);
        }
      }
    }

    return toolsets;
  }
}
