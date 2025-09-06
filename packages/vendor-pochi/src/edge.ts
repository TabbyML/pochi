import { registerModel } from "@getpochi/common/vendor/edge";
import { VendorId } from "./constants";
import { createPochiModel } from "./model";

registerModel(VendorId, createPochiModel);
