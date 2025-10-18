import type { CustomModelSetting } from "../../configuration";
import type { ModelOptions } from "../../vendor/types";

export type DisplayModel =
  | {
      id: string;
      name: string;
      type: "vendor";
      vendorId: string;
      modelId: string;
      options: ModelOptions;
      getCredentials: () => Promise<unknown>;
      contentType?: string[];
    }
  | {
      id: string;
      name: string;
      type: "provider";
      modelId: string;
      options: ModelOptions & { maxTokens?: number };
      provider: RemoveModelsField<CustomModelSetting>;
      contentType?: string[];
    };

type RemoveModelsField<Type> = {
  [Property in keyof Type as Exclude<Property, "models">]: Type[Property];
};
