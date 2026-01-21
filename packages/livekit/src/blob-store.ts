export interface BlobStore {
  put(
    data: Uint8Array,
    mimeType: string,
    signal?: AbortSignal,
  ): Promise<string>;
  get(url: string): Promise<{ data: Uint8Array; mimeType: string } | null>;
}
