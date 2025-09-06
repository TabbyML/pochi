import type { LanguageModelV2 } from "@ai-sdk/provider";

const models: Record<string, CreateModelFunction> = {};

type CreateModelFunction = (opts: CreateModelOptions) => LanguageModelV2;

export type CreateModelOptions = {
  // identifier for the task.
  id: string;

  // identifier for the model,
  modelId: string;

  getCredentials: () => Promise<unknown>;
};

export function registerModel(
  vendorId: string,
  createModel: CreateModelFunction,
) {
  models[vendorId] = createModel;
}

export function createModel(vendorId: string, opts: CreateModelOptions) {
  const model = models[vendorId];
  if (!model) {
    throw new Error(`Vendor ${vendorId} not found`);
  }
  return model(opts);
}
