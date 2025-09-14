import type { Env } from "@/types";

export function selectShard(env: Env, doId: bigint): D1Database {
  const shard = doId % BigInt(1);
  switch (shard) {
    case 0n:
      return env.DB_SHARD_1;
    default:
      throw new Error(`Invalid shard: ${shard}`);
  }
}

export function selectShardByStoreId(env: Env, storeId: string): D1Database {
  const id = env.SYNC_BACKEND_DO.idFromName(storeId).toString();
  const doId = BigInt(`0x${id}`);
  return selectShard(env, doId);
}
