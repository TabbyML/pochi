import { MediaOutput } from "@getpochi/tools";
import type { Store } from "@livestore/livestore";
import z from "zod";
import { StoreBlobProtocol } from ".";
import { events } from "./livestore";
import { makeBlobQuery } from "./livestore/queries";

export async function processContentOutput(
  store: Store,
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
            data: await findBlobUrl(store, item.mimeType, item.data, signal),
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
      data: await findBlobUrl(store, item.mimeType, item.data, signal),
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
  store: Store,
  url: URL,
  mediaType: string,
): { data: string; mediaType: string } | undefined {
  if (url.protocol === StoreBlobProtocol) {
    const blob = store.query(makeBlobQuery(url.pathname));
    if (blob) {
      return {
        data: toBase64(blob.data),
        mediaType: blob.mimeType,
      };
    }
  } else {
    return {
      // @ts-ignore: promise is resolved in flexible-chat-transport. we keep the string type to make toModelOutput type happy.
      data: fetch(url)
        .then((x) => x.blob())
        .then((blob) => blob.arrayBuffer())
        .then((data) => toBase64(new Uint8Array(data))),
      mediaType,
    };
  }
}

export async function fileToUri(
  store: Store,
  file: File,
  signal?: AbortSignal,
) {
  if ("POCHI_CORS_PROXY_PORT" in globalThis) {
    // isBrowser
    return fileToRemoteUri(file, signal);
  }
  const data = new Uint8Array(await file.arrayBuffer());
  const checksum = await digest(data);
  const blob = store.query(makeBlobQuery(checksum));
  const url = `${StoreBlobProtocol}${checksum}`;
  if (blob) {
    return url;
  }

  store.commit(
    events.blobInserted({
      checksum,
      data,
      createdAt: new Date(),
      mimeType: file.type,
    }),
  );

  return url;
}

async function findBlobUrl(
  store: Store,
  mimeType: string,
  base64: string,
  signal?: AbortSignal,
): Promise<string> {
  const file = new File([fromBase64(base64)], "file", {
    type: mimeType,
  });
  return fileToUri(store, file, signal);
}

const fromBase64 = (base64: string) =>
  Uint8Array.from(atob(base64), (v) => v.charCodeAt(0));

async function digest(data: Uint8Array<ArrayBufferLike>): Promise<string> {
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer)); // convert buffer to byte array
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join(""); // convert byte array to hex string
}

async function fileToRemoteUri(file: File, signal?: AbortSignal) {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch("https://app.getpochi.com/api/upload", {
    method: "POST",
    body: formData,
    signal,
  });

  if (!response.ok) {
    throw new Error(`Upload failed: ${response.statusText}`);
  }

  const data = (await response.json()) as { url?: string };

  if (!data.url) {
    throw new Error("Failed to upload attachment");
  }
  return data.url;
}

export function makeDownloadFunction(store: Store) {
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
        if (isUrlSupportedByModel) return null;
        if (url.protocol === StoreBlobProtocol) {
          const blob = store.query(makeBlobQuery(url.pathname));
          if (!blob)
            throw new Error(`Blob with checksum ${url.pathname} not found`);
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
