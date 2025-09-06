import { registerModel } from "@getpochi/common/vendor/edge";
import { createGeminiCliModel } from "./model";
import { VendorId } from "./types";

registerModel(VendorId, createGeminiCliModel);
