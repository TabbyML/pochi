import { MediaOutput } from "@getpochi/tools";
import z from "zod";
import type { BlobStore } from "./blob-store";

export async function processContentOutput(
  blobStore: BlobStore,
  output: unknown,
  signal?: AbortSignal,
) {
  const parsed = ContentOutput.safeParse(output);
  if (parsed.success) {
    if ("content" in parsed.data) {
      const content = parsed.data.content.map(async (item) => {
        if (item.type === "text") {
          return item;
        }
        if (item.type === "image") {
          return {
            type: "image",
            mimeType: item.mimeType,
            data: await findBlobUrl(
              blobStore,
              item.mimeType,
              item.data,
              signal,
            ),
          };
        }
        return item;
      });
      return {
        ...parsed.data,
        content: await Promise.all(content),
      };
    }

    const item = parsed.data;
    return {
      ...item,
      data: await findBlobUrl(blobStore, item.mimeType, item.data, signal),
    };
  }

  if (typeof output === "object" && output !== null && "toolResult" in output) {
    const { toolResult, ...rest } = output as { toolResult: unknown };
    return rest;
  }

  return output;
}

const ContentOutput = z.union([
  z.object({
    content: z.array(
      z.discriminatedUnion("type", [
        z.object({
          type: z.literal("text"),
          text: z.string(),
        }),
        z.object({
          type: z.literal("image"),
          mimeType: z.string(),
          data: z.string(),
        }),
      ]),
    ),
  }),
  MediaOutput,
]);

function toBase64(bytes: Uint8Array) {
  const binString = Array.from(bytes, (byte) =>
    String.fromCodePoint(byte),
  ).join("");
  const base64 = btoa(binString);
  return base64;
}

export function findBlob(
  blobStore: BlobStore,
  url: URL,
  mediaType: string,
): { data: string; mediaType: string } | undefined {
  let dataPromise: Promise<string>;

  if (url.protocol === blobStore.protocol) {
    // We return a promise that resolves to the blob data
    dataPromise = blobStore.get(url.toString()).then((blob) => {
      if (!blob) {
        throw new Error(`Blob ${url} not found`);
      }
      return toBase64(blob.data);
    });
  } else {
    dataPromise = fetch(url)
      .then((x) => x.blob())
      .then((blob) => blob.arrayBuffer())
      .then((data) => toBase64(new Uint8Array(data)));
  }

  return {
    // @ts-ignore: promise is resolved in flexible-chat-transport. we keep the string type to make toModelOutput type happy.
    data: dataPromise,
    mediaType,
  };
}

export async function fileToUri(
  blobStore: BlobStore,
  file: File,
  signal?: AbortSignal,
) {
  const data = new Uint8Array(await file.arrayBuffer());
  return blobStore.put(data, file.type, signal);
}

async function findBlobUrl(
  blobStore: BlobStore,
  mimeType: string,
  base64: string,
  signal?: AbortSignal,
): Promise<string> {
  const file = new File([fromBase64(base64)], "file", {
    type: mimeType,
  });
  return fileToUri(blobStore, file, signal);
}

const fromBase64 = (base64: string) =>
  Uint8Array.from(atob(base64), (v) => v.charCodeAt(0));

export function makeDownloadFunction(blobStore: BlobStore) {
  const downloadFn = async (
    items: Array<{ url: URL; isUrlSupportedByModel: boolean }>,
  ): Promise<
    Array<{ data: Uint8Array; mediaType: string | undefined } | null>
  > => {
    const promises = items.map(
      async ({
        url,
        isUrlSupportedByModel,
      }): Promise<{
        data: Uint8Array;
        mediaType: string | undefined;
      } | null> => {
        if (isUrlSupportedByModel) {
          return null;
        }
        if (url.protocol === blobStore.protocol) {
          const blob = await blobStore.get(url.toString());
          if (!blob) {
            throw new Error(`Blob with checksum ${url.pathname} not found`);
          }
          return {
            data: blob.data,
            mediaType: blob.mimeType,
          };
        }
        const resp = await fetch(url);
        return {
          data: new Uint8Array(await resp.arrayBuffer()),
          mediaType: resp.headers.get("content-type") || undefined,
        };
      },
    );
    return Promise.all(promises);
  };

  return downloadFn;
}
