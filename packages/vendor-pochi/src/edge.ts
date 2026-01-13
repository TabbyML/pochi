import { registerModel } from "@getpochi/common/vendor/edge";
import { createPochiModel } from "./model";
import { VendorId } from "./types";

registerModel(VendorId, createPochiModel);

// ragdoll would use ModelGatewayRequest and ListModelsResponse
export {
  PochiApiErrors,
  WebhookEventPayload,
  ModelGatewayRequest,
  ListModelsResponse,
} from "./pochi-api";
