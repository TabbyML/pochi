import { registerModel } from "@getpochi/common/vendor/edge";
import { createQwenModel } from "./model";
import { VendorId } from "./types";

registerModel(VendorId, createQwenModel);
