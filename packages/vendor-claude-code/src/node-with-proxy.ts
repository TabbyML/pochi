import { getLogger } from "@getpochi/common";
import { initializeProxy } from "./proxy";
import { VendorId } from "./types";

const logger = getLogger(`${VendorId}-node-proxy`);

initializeProxy().catch((error) => {
  logger.error("Proxy initialization error:", error);
});

export * from "./node";
