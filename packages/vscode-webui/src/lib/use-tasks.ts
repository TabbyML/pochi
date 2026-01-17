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
  const record = value as Record<string, unknown>;
  const runAsync = record.runAsync;
  if (typeof runAsync === "boolean") {
    return { ...record, runAsync: runAsync ? 1 : 0 };
  }
  if (runAsync === undefined) {
    return { ...record, runAsync: 0 };
  }
  return value;
}
