import { PochiApiErrors } from "@getpochi/vendor-pochi/edge";
import { APICallError } from "ai";
import { ReadyForRetryError } from "../hooks/use-ready-for-retry-error";

export function isRetryableError(error: Error) {
  if (error instanceof ReadyForRetryError && error.kind === "content-filter") {
    return false;
  }

  if (Object.values(PochiApiErrors).includes(error.message)) {
    return false;
  }

  if (APICallError.isInstance(error) && error.isRetryable === false) {
    return false;
  }

  return true;
}
