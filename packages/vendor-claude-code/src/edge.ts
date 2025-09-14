import { registerModel } from "@getpochi/common/vendor/edge";
import { createClaudeCodeModel } from "./model";
import { VendorId } from "./types";

registerModel(VendorId, createClaudeCodeModel);
