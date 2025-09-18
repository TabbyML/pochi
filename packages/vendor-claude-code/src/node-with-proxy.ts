import { getLogger } from "@getpochi/common";
import { VendorId } from "./types";
import { initializeProxy } from "./proxy";

const logger = getLogger(`${VendorId}-node-proxy`);

initializeProxy().catch((error) => {
  logger.error("Proxy initialization error:", error);
});

export * from "./node";
