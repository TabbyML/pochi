import { registerModel } from "@getpochi/common/vendor/edge";
import { createQwenCoderModel, createEdgeQwenCoderModel } from "./model";
import { VendorId } from "./types";

const modelCreator =
  "window" in globalThis ? createEdgeQwenCoderModel : createQwenCoderModel;

registerModel(VendorId, modelCreator);
