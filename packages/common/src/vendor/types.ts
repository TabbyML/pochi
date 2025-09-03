export abstract class Vendor {
  abstract authenticated: boolean;

  abstract getUser(): Promise<User | null>;

  abstract logout(): Promise<void>;

  abstract fetchModels(): Promise<Record<string, Model>>;
}

export type User = {
  name: string;
  email: string;
};

export type Model = {
  id: string;
  contextWindow: number;
  maxOutputTokens: number;
};
