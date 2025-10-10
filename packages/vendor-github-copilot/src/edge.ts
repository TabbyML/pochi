import { registerModel } from "@getpochi/common/vendor/edge";
import { createCopilotModel } from "./model";
import { VendorId } from "./types";

registerModel(VendorId, createCopilotModel);
