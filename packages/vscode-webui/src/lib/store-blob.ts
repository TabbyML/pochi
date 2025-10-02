import { catalog } from "@getpochi/livekit";
import { useStore } from "@livestore/react";

const blobs = new Map<string, string>();

export function setBlobUrl(key: string, data: Blob) {
  blobs.set(key, URL.createObjectURL(data));
}

export function useStoreBlobUrl(inputUrl: string): string | null {
  const { store } = useStore();
  const value = blobs.get(inputUrl);
  if (value) {
    return value;
  }

  const url = new URL(inputUrl);
  if (url.protocol !== "store-blob:") return inputUrl;
  const data = store.query(catalog.queries.makeBlobQuery(url.pathname));
  if (!data) return null;
  const blob = new Blob([data.data], {
    type: data.mimeType,
  });
  setBlobUrl(inputUrl, blob);
  return blobs.get(inputUrl) ?? null;
}
