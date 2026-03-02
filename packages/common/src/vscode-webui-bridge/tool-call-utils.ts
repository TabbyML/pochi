import * as R from "remeda";
import type { BuiltinSubAgentInfo } from ".";

export class PlannerPermissionError extends Error {
  constructor() {
    super("Planner only able to write pochi://-/plan.md");
  }
}

const StoreIdAuthorityPrefix = "sid-hex-";
const LowerHexPattern = /^[0-9a-f]+$/;

function bytesToLowerHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

function lowerHexToBytes(hex: string): Uint8Array | null {
  if (hex.length === 0 || hex.length % 2 !== 0 || !LowerHexPattern.test(hex)) {
    return null;
  }

  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < hex.length; index += 2) {
    const byte = Number.parseInt(hex.slice(index, index + 2), 16);
    if (Number.isNaN(byte)) {
      return null;
    }
    bytes[index / 2] = byte;
  }
  return bytes;
}

export function encodeStoreIdForUriAuthority(storeId: string): string {
  const encoded = new TextEncoder().encode(storeId);
  return `${StoreIdAuthorityPrefix}${bytesToLowerHex(encoded)}`;
}

export function decodeStoreIdFromUriAuthority(
  authority: string,
): string | null {
  if (!authority.startsWith(StoreIdAuthorityPrefix)) {
    return null;
  }

  const encoded = authority.slice(StoreIdAuthorityPrefix.length);
  const bytes = lowerHexToBytes(encoded);
  if (!bytes) {
    return null;
  }

  try {
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

export const resolvePochiUri = (
  path: string,
  storeId: string,
  builtinSubAgentInfo?: BuiltinSubAgentInfo,
): string => {
  if (!path.startsWith("pochi:")) {
    return path;
  }

  if (builtinSubAgentInfo?.type === "planner" && path !== "pochi://-/plan.md") {
    throw new PlannerPermissionError();
  }

  if (!storeId || storeId.length === 0) {
    throw new Error("storeId is required");
  }

  const authority = encodeStoreIdForUriAuthority(storeId);
  return path.replace("/-/", `/${authority}/`);
};

export const resolveToolCallArgs = (
  args: unknown,
  storeId: string,
  builtinSubAgentInfo?: BuiltinSubAgentInfo,
): unknown => {
  if (typeof args === "string") {
    try {
      return resolvePochiUri(args, storeId, builtinSubAgentInfo);
    } catch (err) {
      if (err instanceof PlannerPermissionError) {
        throw err;
      }
      return args;
    }
  }

  if (Array.isArray(args)) {
    return args.map((item) =>
      resolveToolCallArgs(item, storeId, builtinSubAgentInfo),
    );
  }

  if (R.isObjectType(args)) {
    return R.mapValues(args, (v) =>
      resolveToolCallArgs(v, storeId, builtinSubAgentInfo),
    );
  }

  return args;
};
