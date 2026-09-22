import { vscodeHost } from "@/lib/vscode";
import { getLogger } from "@getpochi/common";
import { catalog } from "@getpochi/livekit";
import { Schema } from "@livestore/livestore";
import { computed } from "@preact/signals-core";
import { threadSignal } from "@quilted/threads/signals";
import { useQuery } from "@tanstack/react-query";

const logger = getLogger("useTasks");

/** @useSignals */
export const useTasks = () => {
  const { data } = useQuery({
    queryKey: ["tasks"],
    queryFn: readTasks,
    staleTime: Number.POSITIVE_INFINITY,
  });

  return data?.value || [];
};

async function readTasks() {
  const tasks = threadSignal(await vscodeHost.readTasks());
  return computed(() =>
    // Decode row by row: a single incompatible row (e.g. written by another
    // extension version) must not take down the whole task list.
    Object.values(tasks.value).flatMap((v) => {
      try {
        return [
          Schema.decodeUnknownSync(catalog.tables.tasks.rowSchema)(
            normalizeTaskRow(v),
          ),
        ];
      } catch (error) {
        logger.warn("Skipping task that failed to decode", error);
        return [];
      }
    }),
  );
}

function normalizeTaskRow(value: unknown) {
  if (!value || typeof value !== "object") return value;
  // Back-compat: older task rows may lack runAsync / background; default to 0
  // for schema decode.
  const record = value as Record<string, unknown>;
  const next: Record<string, unknown> = { ...record };
  let changed = false;
  if (record.runAsync === undefined) {
    next.runAsync = 0;
    changed = true;
  }
  if (record.background === undefined) {
    next.background = 0;
    changed = true;
  }
  return changed ? next : value;
}
