import { registerModel } from "@getpochi/common/vendor/edge";
import { createClaudeCodeModel, createEdgeClaudeCodeModel } from "./model";
import { VendorId } from "./types";

const modelCreator =
  "window" in globalThis ? createEdgeClaudeCodeModel : createClaudeCodeModel;

registerModel(VendorId, modelCreator);
