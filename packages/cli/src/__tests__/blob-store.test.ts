import { describe, it, expect, beforeEach } from "vitest";
import { NodeBlobStore } from "../blob-store";

describe("NodeBlobStore", () => {
  let store: NodeBlobStore;

  beforeEach(() => {
    store = new NodeBlobStore();
  });

  it("should put and get a blob", async () => {
    const data = new Uint8Array([1, 2, 3, 4]);
    const mimeType = "application/octet-stream";
    const url = await store.put(data, mimeType);

    expect(url).toMatch(/^store-blob:[0-9a-f]{64}$/);

    const blob = await store.get(url);
    expect(blob).not.toBeNull();
    expect(blob?.data).toEqual(data);
    expect(blob?.mimeType).toEqual(mimeType);
  });

  it("should return null for non-existent blob", async () => {
    const blob = await store.get("store-blob:nonexistent");
    expect(blob).toBeNull();
  });

  it("should return null for invalid protocol", async () => {
    const blob = await store.get("http://example.com");
    expect(blob).toBeNull();
  });
});
