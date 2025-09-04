import {
  type UserInfo,
  type VendorConfig,
  getVendorConfig,
  updateVendorConfig,
} from "../configuration";

export abstract class VendorBase {
  constructor(readonly vendorId: string) {}

  async getCredentials(): Promise<unknown> {
    const { credentials } = this.getVendorConfig();
    const newCredentials = await this.renewCredentials(credentials);
    if (credentials !== newCredentials) {
      updateVendorConfig(this.vendorId, {
        credentials: newCredentials,
      });
    }

    return newCredentials;
  }

  async getUserInfo(): Promise<UserInfo> {
    const { user } = this.getVendorConfig();
    if (user) return user;

    const credentials = await this.getCredentials();

    const newUser = await this.fetchUserInfo(credentials);
    await updateVendorConfig(this.vendorId, {
      user: newUser,
      credentials,
    });
    return newUser;
  }

  abstract fetchModels(): Promise<Record<string, ModelOptions>>;

  get authenticated() {
    const config = getVendorConfig(this.vendorId);
    return !!config?.credentials;
  }

  protected abstract renewCredentials(credentials: unknown): Promise<unknown>;

  protected abstract fetchUserInfo(credentials: unknown): Promise<UserInfo>;

  protected async updateCredentials(credentials: unknown) {
    await updateVendorConfig(this.vendorId, { credentials });
  }

  protected getVendorConfig(): VendorConfig {
    const config = getVendorConfig(this.vendorId);
    if (!config) throw new Error(`Vendor ${this.vendorId} not found`);
    if (!config.credentials)
      throw new Error(`Vendor ${this.vendorId} not authenticated`);
    return config;
  }
}

export type ModelOptions = {
  contextWindow: number;
  maxOutputTokens: number;
  useToolCallMiddleware?: boolean;
};
