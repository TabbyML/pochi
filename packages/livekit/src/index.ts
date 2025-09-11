import { binary_to_base58 } from "base58-js";
import * as jose from "jose";
import type { RequestData } from "./types";

export * as catalog from "./livestore";
export type LLMRequestData = RequestData["llm"];
export type { Message, Task, UITools, DataParts } from "./types";

export function getStoreId(cwd: string, jwt: string | null) {
  const sub = jwt ? jose.decodeJwt(jwt).sub : undefined;
  const id = binary_to_base58(new TextEncoder().encode(cwd));
  if (sub) {
    return `store-${sub}-${id}`;
  }

  return `store-local-${id}`;
}
