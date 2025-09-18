import { registerModel } from "@getpochi/common/vendor/edge";
import { createClaudeCodeModel, createWebviewClaudeCodeModel } from "./model";
import { VendorId } from "./types";

const modelCreator =
  typeof process !== "undefined" && process.versions != null
    ? createClaudeCodeModel
    : createWebviewClaudeCodeModel;

registerModel(VendorId, modelCreator);
