import { registerModel } from "@getpochi/common/vendor/edge";
import { createPochiModel } from "./model";
import { VendorId } from "./types";

registerModel(VendorId, createPochiModel);
