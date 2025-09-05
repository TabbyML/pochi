import type { CustomModelSetting } from "../../configuration";
import type { ModelOptions } from "../../vendor";

export type DisplayModel =
  | {
      id: string;
      name?: string;
      type: "vendor";
      vendorId: string;
      modelId: string;
      options: ModelOptions;
      getCredentials: () => Promise<unknown>;
    }
  | {
      id: string;
      name?: string;
      type: "provider";
      modelId: string;
      options: ModelOptions & { maxTokens: number };
      provider: RemoveModelsField<CustomModelSetting>;
    };

type RemoveModelsField<Type> = {
  [Property in keyof Type as Exclude<Property, "models">]: Type[Property];
};
