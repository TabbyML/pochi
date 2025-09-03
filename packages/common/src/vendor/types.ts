export abstract class VendorBase {
  abstract authenticated: boolean;

  abstract getUser(): Promise<User | null>;

  abstract logout(): Promise<void>;

  abstract fetchModels(): Promise<Record<string, ModelOptions>>;

  abstract readCredentials(): Promise<unknown>;
}

export type User = {
  name: string;
  email: string;
};

export type ModelOptions = {
  contextWindow: number;
  maxOutputTokens: number;
};
