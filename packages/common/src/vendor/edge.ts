import type { LanguageModelV2 } from "@ai-sdk/provider";
import { createRegistry } from "./registry";

type CreateModelFunction = (opts: CreateModelOptions) => LanguageModelV2;

export type CreateModelOptions = {
  // identifier for the model,
  modelId: string;

  getCredentials: () => Promise<unknown>;
};

const { register, get } = createRegistry<CreateModelFunction>();

export const registerModel = register;

export function createModel(vendorId: string, opts: CreateModelOptions) {
  const modelCreator = get(vendorId);
  return modelCreator(opts);
}

declare global {
  var POCHI_CORS_PROXY_PORT: string;
}
