export interface BlobStore {
  readonly protocol: string;
  put(
    data: Uint8Array,
    mimeType: string,
    signal?: AbortSignal,
  ): Promise<string>;
  get(url: string): Promise<{ data: Uint8Array; mimeType: string } | null>;
}
