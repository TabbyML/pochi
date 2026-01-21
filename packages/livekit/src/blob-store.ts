export interface BlobStore {
  put(data: Uint8Array, mimeType: string): Promise<string>;
  get(url: string): Promise<{ data: Uint8Array; mimeType: string } | null>;
}
