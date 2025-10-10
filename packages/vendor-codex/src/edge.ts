import { registerModel } from "@getpochi/common/vendor/edge";
import { createCodexModel, createEdgeCodexModel } from "./model";
import { VendorId } from "./types";

const modelCreator =
  "window" in globalThis ? createEdgeCodexModel : createCodexModel;

registerModel(VendorId, modelCreator);
