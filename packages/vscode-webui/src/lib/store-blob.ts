import { catalog } from "@getpochi/livekit";
import { useStore } from "@livestore/react";
import { isVSCodeEnvironment } from "./vscode";

const blobs = new Map<string, string>();

export function setBlobUrl(key: string, data: Blob) {
  blobs.set(key, URL.createObjectURL(data));
}

export function useStoreBlobUrl(inputUrl: string): string | null {
  const value = blobs.get(inputUrl);
  if (value) {
    return value;
  }

  const url = new URL(inputUrl);
  if (url.protocol !== "store-blob:") return inputUrl;
  if (isVSCodeEnvironment()) {
    const { store } = useStore();
    const data = store.query(catalog.queries.makeBlobQuery(url.pathname));
    if (!data) return null;
    const blob = new Blob([data.data], {
      type: data.mimeType,
    });
    setBlobUrl(inputUrl, blob);
  } else {
    const storeIdMatch = window.location.pathname.match(/^\/stores\/([^/]+)/);
    if (!storeIdMatch) return null;

    const storeId = storeIdMatch[1];
    const blobUrl = new URL(`/stores/${storeId}/blobs/${url.pathname}`);
    blobs.set(inputUrl, blobUrl.toString());
  }
  return blobs.get(inputUrl) ?? null;
}
