import { base58_to_binary, binary_to_base58 } from "base58-js";
import z from "zod/v4";

export const StoreId = z.object({
  sub: z.string(),
  machineId: z.string(),
  cwd: z.string(),
  date: z.string().describe("Local date in MM/DD/YYYY format"),
});

export type StoreId = z.infer<typeof StoreId>;

export function encodeStoreId(storeId: StoreId): string {
  const encoded = new TextEncoder().encode(JSON.stringify(storeId));
  return binary_to_base58(encoded);
}

function createShortHash(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) - hash + input.charCodeAt(i)) & 0xffffffff;
  }
  return Math.abs(hash).toString(36).slice(0, 8); // 8 characters for better uniqueness
}

export function decodeStoreId(storeId: string): StoreId {
  const decoded = new TextDecoder().decode(base58_to_binary(storeId));
  return StoreId.parse(JSON.parse(decoded));
}
