import { registerModel } from "@getpochi/common/vendor/edge";
import { createTabbyModel } from "./model";
import { VendorId } from "./types";

registerModel(VendorId, createTabbyModel);
