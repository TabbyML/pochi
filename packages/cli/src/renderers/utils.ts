import type { BlobStore } from "@getpochi/livekit";
import * as R from "remeda";

export async function mapStoreBlob(
  store: BlobStore,
  o: unknown,
): Promise<unknown> {
  if (R.isString(o) && o.startsWith(store.protocol)) {
    const blob = await store.get(o);
    if (!blob) throw new Error(`Store blob not found at "${o}"`);

    const base64 = Buffer.from(blob.data).toString("base64");
    return `data:${blob.mimeType};base64,${base64}`;
  }

  if (R.isArray(o)) {
    return Promise.all(o.map((el) => mapStoreBlob(store, el)));
  }

  if (R.isObjectType(o)) {
    const entires = await Promise.all(
      R.entries(o as Record<string, unknown>).map(
        async ([k, v]): Promise<[string, unknown]> => [
          k,
          await mapStoreBlob(store, v),
        ],
      ),
    );
    return R.fromEntries(entires);
  }

  return o;
}
