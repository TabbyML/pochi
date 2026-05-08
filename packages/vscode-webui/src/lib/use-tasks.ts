import { vscodeHost } from "@/lib/vscode";
import { catalog } from "@getpochi/livekit";
import { Schema } from "@livestore/livestore";
import { computed } from "@preact/signals-core";
import { threadSignal } from "@quilted/threads/signals";
import { useQuery } from "@tanstack/react-query";

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
    Object.values(tasks.value).map((v) =>
      Schema.decodeUnknownSync(catalog.tables.tasks.rowSchema)(
        normalizeTaskRow(v),
      ),
    ),
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
