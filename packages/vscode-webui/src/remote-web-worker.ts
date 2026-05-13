import {
  isCrossOriginWorkerUrl,
  makeSharedWorkerBootstrapUrl,
  makeWorkerBootstrapBlobUrl,
  resolveWorkerUrl,
  revokeWorkerBootstrapBlobUrl,
} from "./lib/worker-url";

if (import.meta.env.DEV) {
  typeof window !== "undefined" &&
    // biome-ignore lint/suspicious/noAssignInExpressions: <explanation>
    // biome-ignore lint/suspicious/noGlobalAssign: <explanation>
    (Worker = ((BaseWorker: typeof Worker) =>
      class Worker extends BaseWorker {
        constructor(scriptURL: string | URL, options?: WorkerOptions) {
          const url = resolveWorkerUrl(scriptURL);
          const bootstrapUrl = isCrossOriginWorkerUrl(url)
            ? // Dedicated workers need a blob: bootstrap so OPFS inherits the
              // webview origin. SharedWorker keeps a deterministic data: URL below.
              makeWorkerBootstrapBlobUrl(url, options?.type)
            : undefined;
          try {
            super(bootstrapUrl ?? scriptURL, options);
          } finally {
            if (bootstrapUrl) {
              setTimeout(() => revokeWorkerBootstrapBlobUrl(bootstrapUrl), 0);
            }
          }
        }
      })(Worker));

  typeof window !== "undefined" &&
    // biome-ignore lint/suspicious/noAssignInExpressions: <explanation>
    // biome-ignore lint/suspicious/noGlobalAssign: <explanation>
    (SharedWorker = ((BaseWorker: typeof SharedWorker) =>
      class SharedWorker extends BaseWorker {
        constructor(scriptURL: string | URL, options?: string | WorkerOptions) {
          const url = resolveWorkerUrl(scriptURL);
          super(
            isCrossOriginWorkerUrl(url)
              ? // SharedWorkers are keyed by URL. A deterministic data URL preserves
                // a single shared instance across VS Code panels, while blob URLs do not.
                makeSharedWorkerBootstrapUrl(
                  url,
                  typeof options === "object" ? options?.type : undefined,
                )
              : scriptURL,
            options,
          );
        }
      })(SharedWorker));
}
