import { getServerBaseUrl } from "@getpochi/common/vscode-webui-bridge";
import type { BlobStore } from "@getpochi/livekit";

class RemoteBlobStore implements BlobStore {
  readonly protocol = "https:";
  async put(
    data: Uint8Array,
    mimeType: string,
    signal?: AbortSignal,
  ): Promise<string> {
    const file = new File([data as unknown as BlobPart], "blob", {
      type: mimeType,
    });

    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch(`${getServerBaseUrl()}/api/upload`, {
      method: "POST",
      body: formData,
      signal,
    });

    if (!response.ok) {
      throw new Error(`Upload failed: ${response.statusText}`);
    }

    const result = await response.json();

    if (!result.url) {
      throw new Error("Failed to upload attachment");
    }
    return result.url;
  }

  async get(
    url: string,
  ): Promise<{ data: Uint8Array; mimeType: string } | null> {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        return null;
      }
      const blob = await response.blob();
      return {
        data: new Uint8Array(await blob.arrayBuffer()),
        mimeType: blob.type,
      };
    } catch {
      return null;
    }
  }
}

export const blobStore = new RemoteBlobStore();
