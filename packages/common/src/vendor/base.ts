import * as runExclusive from "run-exclusive";
import {
  type UserInfo,
  type VendorConfig,
  getVendorConfig,
  updateVendorConfig,
} from "../configuration";
import type { AuthOutput, ModelOptions } from "./types";

export abstract class VendorBase {
  constructor(readonly vendorId: string) {
    this.getCredentials = runExclusive
      .buildMethod(this.getCredentials)
      .bind(this);
    this.getUserInfo = runExclusive.buildMethod(this.getUserInfo).bind(this);
  }

  getCredentials = async (): Promise<unknown> => {
    const { credentials } = this.getVendorConfig();
    const newCredentials = await this.renewCredentials(credentials);
    if (credentials !== newCredentials) {
      await updateVendorConfig(this.vendorId, {
        credentials: newCredentials,
      });
    }

    return newCredentials;
  };

  getUserInfo = async (): Promise<UserInfo> => {
    const { user } = this.getVendorConfig();
    if (user) return user;

    const credentials = await this.getCredentials();

    const newUser = await this.fetchUserInfo(credentials);
    await updateVendorConfig(this.vendorId, {
      user: newUser,
      credentials,
    });
    return newUser;
  };

  abstract fetchModels(): Promise<Record<string, ModelOptions>>;

  abstract authenticate(): Promise<AuthOutput>;

  logout() {
    return updateVendorConfig(this.vendorId, null);
  }

  get authenticated() {
    const config = getVendorConfig(this.vendorId);
    return !!config?.credentials;
  }

  protected abstract renewCredentials(credentials: unknown): Promise<unknown>;

  protected abstract fetchUserInfo(credentials: unknown): Promise<UserInfo>;

  private getVendorConfig(): VendorConfig {
    const config = getVendorConfig(this.vendorId);
    if (!config) throw new Error(`Vendor ${this.vendorId} not found`);
    if (!config.credentials)
      throw new Error(`Vendor ${this.vendorId} not authenticated`);
    return config;
  }
}
