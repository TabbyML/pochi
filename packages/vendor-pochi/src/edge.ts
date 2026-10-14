import { registerModel } from "@getpochi/common/vendor/edge";
import { createPochiModel } from "./model";
import { VendorId } from "./types";

registerModel(VendorId, createPochiModel);

export {
  ModelAccessResponse,
  PochiApiErrors,
  WebhookEventPayload,
} from "./pochi-api";
export type { PochiApi, PochiApiClient } from "./pochi-api";
