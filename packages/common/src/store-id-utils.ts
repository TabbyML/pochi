import { base58_to_binary, binary_to_base58 } from "base58-js";
import * as jose from "jose";
import z from "zod/v4";

export const StoreId = z.object({
  sub: z.string(),
  taskId: z.string(),
});

export type StoreId = z.infer<typeof StoreId>;

export function decodeStoreId(storeId: string): StoreId {
  const decoded = new TextDecoder().decode(base58_to_binary(storeId));
  return StoreId.parse(JSON.parse(decoded));
}

export function encodeStoreId(jwt: string | null, taskId: string): string {
  const sub = (jwt ? jose.decodeJwt(jwt).sub : undefined) ?? "anonymous";

  const storeId: StoreId = {
    sub,
    taskId,
  };

  const encoded = new TextEncoder().encode(JSON.stringify(storeId));
  return binary_to_base58(encoded);
}
