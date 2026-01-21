import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { BlobStore } from "@getpochi/livekit";

export class NodeBlobStore implements BlobStore {
  private readonly dir: string;

  constructor() {
    this.dir = path.join(os.tmpdir(), "pochi", "blobs");
  }

  async put(
    data: Uint8Array,
    mimeType: string,
    _signal?: AbortSignal,
  ): Promise<string> {
    await fs.mkdir(this.dir, { recursive: true });
    const checksum = await this.digest(data);
    const filePath = path.join(this.dir, checksum);

    // Check if file exists to avoid writing again?
    // But mimeType might be needed if we store metadata.
    // For now, just write data. The mimeType is returned by get() so we need to store it?
    // The StoreBlobProtocol url is store-blob:checksum.
    // We need to store mimeType too.
    // Let's store metadata in a sidecar file or just assume we know it?
    // Wait, findBlob returns mimeType.
    // In livekit implementation, it stores in sqlite with mimeType.

    // If I use file system, I need to store mimeType.
    // Maybe store as `checksum.json` containing `{ mimeType, data (base64 or just reference?) }`?
    // Or `checksum.meta` for mimeType.

    await fs.writeFile(filePath, data);
    await fs.writeFile(`${filePath}.meta`, mimeType, "utf-8");

    return `store-blob:${checksum}`;
  }

  async get(
    url: string,
  ): Promise<{ data: Uint8Array; mimeType: string } | null> {
    if (!url.startsWith("store-blob:")) {
      return null;
    }
    const checksum = url.slice("store-blob:".length);
    const filePath = path.join(this.dir, checksum);

    try {
      const data = await fs.readFile(filePath);
      const mimeType = await fs.readFile(`${filePath}.meta`, "utf-8");
      return { data: new Uint8Array(data), mimeType };
    } catch (error) {
      return null;
    }
  }

  private async digest(data: Uint8Array): Promise<string> {
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }
}
