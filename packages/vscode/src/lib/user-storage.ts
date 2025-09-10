import { getLogger } from "@getpochi/common";
import type { UserInfo } from "@getpochi/common/configuration";
import { pochiConfig } from "@getpochi/common/configuration/node";
import { getVendors } from "@getpochi/common/vendor";
import { type Signal, effect, signal } from "@preact/signals-core";
import { injectable, singleton } from "tsyringe";
import type * as vscode from "vscode";

const logger = getLogger("UserStorage");

@injectable()
@singleton()
export class UserStorage implements vscode.Disposable {
  dispose() {}

  readonly users: Signal<Record<string, UserInfo>> = signal({});

  constructor() {
    effect(() => {
      // Explicitly depend on the config to trigger the effect
      if (pochiConfig.value.vendors) {
        this.fetchUserStorage().then((users) => {
          this.users.value = users;
        });
      }
    });
  }

  private async fetchUserStorage(): Promise<Record<string, UserInfo>> {
    const users: Record<string, UserInfo> = {};

    const vendors = getVendors();

    // From vendors
    for (const [vendorId, vendor] of Object.entries(vendors)) {
      if (vendor.authenticated) {
        try {
          const userInfo = await vendor.getUserInfo();
          users[vendorId] = userInfo;
        } catch (e) {
          logger.error(`Failed to fetch user info for vendor ${vendorId}:`, e);
        }
      }
    }

    return users;
  }
}
