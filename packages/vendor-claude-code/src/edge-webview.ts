import { registerModel } from "@getpochi/common/vendor/edge";
import { createWebviewClaudeCodeModel } from "./model";
import { VendorId } from "./types";

registerModel(VendorId, createWebviewClaudeCodeModel);
