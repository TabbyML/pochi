import type { Store } from "@livestore/livestore";
import z from "zod";
import { StoreBlobProtocol } from ".";
import { events } from "./livestore";
import { makeBlobQuery } from "./livestore/queries";

export async function processContentOutput(store: Store, output: unknown) {
  const parsed = ContentOutput.safeParse(output);
  if (parsed.success) {
    const content = parsed.data.content.map(async (item) => {
      if (item.type === "text") {
        return item;
      }
      if (item.type === "image") {
        return {
          type: "image",
          mimeType: item.mimeType,
          data: await findBlobUrl(store, item.mimeType, item.data),
        };
      }
      return item;
    });
    return {
      ...parsed.data,
      content: await Promise.all(content),
    };
  }
  return output;
}

const ContentOutput = z.object({
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
});

export async function arrayBufferToStoreBlobUri(
  store: Store,
  mimeType: string,
  data: Uint8Array<ArrayBufferLike>,
) {
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
      mimeType,
    }),
  );

  return url;
}

async function findBlobUrl(
  store: Store,
  mimeType: string,
  base64: string,
): Promise<string> {
  return arrayBufferToStoreBlobUri(store, mimeType, fromBase64(base64));
}

const fromBase64 = (base64: string) =>
  Uint8Array.from(atob(base64), (v) => v.charCodeAt(0));

async function digest(data: Uint8Array<ArrayBufferLike>): Promise<string> {
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer)); // convert buffer to byte array
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join(""); // convert byte array to hex string
}
