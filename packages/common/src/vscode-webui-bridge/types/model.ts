import type { CustomModelSetting } from "../../configuration";
import type { ModelOptions } from "../../vendor";

export type DisplayModel =
  | ({
      key: string;
      name?: string;
      type: "vendor";
      vendorId: string;
      modelId: string;
    } & ModelOptions)
  | ({
      key: string;
      name?: string;
      type: "provider";
      modelId: string;
      maxTokens: number;
      provider: RemoveModelsField<CustomModelSetting>;
    } & ModelOptions);

type RemoveModelsField<Type> = {
  [Property in keyof Type as Exclude<Property, "models">]: Type[Property];
};
