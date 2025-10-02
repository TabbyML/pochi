import type { Store } from "@livestore/livestore";
import type { AbstractChat } from "ai";
import z from "zod";
import { StoreBlobProtocol } from "..";
import { events } from "../livestore";
import { makeBlobQuery } from "../livestore/queries";
import type { Message } from "../types";

export function makeChatWithHookClass<
  T extends new (
    // biome-ignore lint/suspicious/noExplicitAny: mixin class
    ...args: any[]
  ) => {
    addToolResult: AbstractChat<Message>["addToolResult"];
  },
>(store: Store, chatClass: T) {
  const chatWithHook = class extends chatClass {
    // biome-ignore lint/suspicious/noExplicitAny: mixin class
    constructor(...args: any[]) {
      super(...args);

      const addToolResult = this.addToolResult.bind(this);
      this.addToolResult = async (options) => {
        const parsed = ContentOutput.safeParse(options.output);
        if (parsed.success) {
          const content = parsed.data.content.map(async (item) => {
            if (item.type === "text") {
              return item;
            }
            if (item.type === "image") {
              return {
                type: "image",
                mimeType: item.mimeType,
                blobUri: await findBlobUrl(store, item.mimeType, item.data),
              };
            }
            return item;
          });
          const output = {
            ...options.output,
            content: await Promise.all(content),
          };
          return addToolResult({
            ...options,
            // @ts-ignore
            output,
          });
        }
        return addToolResult(options);
      };
    }
  };
  return chatWithHook;
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

async function findBlobUrl(
  store: Store,
  mimeType: string,
  base64: string,
): Promise<string> {
  const data = fromBase64(base64);
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

const fromBase64 = (base64: string) =>
  Uint8Array.from(atob(base64), (v) => v.charCodeAt(0));

async function digest(data: Uint8Array<ArrayBuffer>): Promise<string> {
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer)); // convert buffer to byte array
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join(""); // convert byte array to hex string
}
