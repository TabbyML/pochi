import { PochiApiErrors } from "@getpochi/vendor-pochi/edge";
import { APICallError } from "ai";

export function isRetryableError(error: Error) {
  if (Object.values(PochiApiErrors).includes(error.message)) {
    return false;
  }

  if (APICallError.isInstance(error) && error.isRetryable === false) {
    return false;
  }

  return true;
}
