import { describe, expect, it } from "vitest";
import {
  decodeStoreIdFromUriAuthority,
  encodeStoreIdForUriAuthority,
  resolvePochiUri,
} from "../tool-call-utils";

describe("tool-call-utils", () => {
  it("encodes storeId to lowercase-safe URI authority", () => {
    const storeId = "AbC123+/=";
    const authority = encodeStoreIdForUriAuthority(storeId);

    expect(authority.startsWith("sid-hex-")).toBe(true);
    expect(authority).toBe(authority.toLowerCase());
    expect(decodeStoreIdFromUriAuthority(authority)).toBe(storeId);
  });

  it("supports authority decoding after lowercase normalization", () => {
    const storeId = "q3KLMNop";
    const authority = encodeStoreIdForUriAuthority(storeId);

    expect(decodeStoreIdFromUriAuthority(authority.toLowerCase())).toBe(
      storeId,
    );
  });

  it("resolves pochi URI with encoded authority", () => {
    const storeId = "StoreID-MixedCase";
    const authority = encodeStoreIdForUriAuthority(storeId);

    expect(resolvePochiUri("pochi://-/plan.md", storeId)).toBe(
      `pochi://${authority}/plan.md`,
    );
  });
});
