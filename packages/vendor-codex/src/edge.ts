import { registerModel } from "@getpochi/common/vendor/edge";
import { createCodexModel } from "./model";
import { VendorId } from "./types";

registerModel(VendorId, createCodexModel);