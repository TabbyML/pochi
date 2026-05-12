export function resolveWorkerUrl(scriptURL: string | URL): string {
  return new URL(scriptURL, import.meta.url).toString();
}

export function isCrossOriginWorkerUrl(scriptURL: string | URL): boolean {
  const url = new URL(resolveWorkerUrl(scriptURL));
  if (url.protocol === "data:") {
    return false;
  }
  return url.origin !== location.origin;
}

export function makeWorkerBootstrapSource(
  url: string,
  type: WorkerOptions["type"] | undefined,
): string {
  if (type === "module") {
    return `import ${JSON.stringify(url)}`;
  }

  return `importScripts=((i)=>(...a)=>i(...a.map((u)=>''+new URL(u,"${url}"))))(importScripts);importScripts("${url}")`;
}

function bypassVsCodeLocalhostWorkerRouting(url: string): string {
  const parsed = new URL(url);
  if (parsed.protocol === "http:" && parsed.hostname === "localhost") {
    // `localhost.` still resolves to loopback, but it does not match VS Code's
    // webview service-worker localhost routing regex. Blob workers have no
    // `?id=` in their client URL, so that routing path can hang while trying to
    // find the owning webview. Let Vite handle the CORS request directly.
    parsed.hostname = "localhost.";
  }
  return parsed.toString();
}

export function getWebviewId(): string | undefined {
  if (typeof location === "undefined") {
    return;
  }
  return new URL(location.href).searchParams.get("id") ?? undefined;
}

export function makeWorkerBootstrapUrl(
  url: string,
  type: WorkerOptions["type"] | undefined,
  webviewId = getWebviewId(),
): string {
  // VS Code's webview service worker uses the worker client URL's `id`
  // query to route localhost and webview-resource requests back to the panel.
  const source = webviewId
    ? `${makeWorkerBootstrapSource(url, type)}\n//# sourceURL=vscode-worker`
    : makeWorkerBootstrapSource(url, type);
  const idSearch = webviewId ? `?id=${encodeURIComponent(webviewId)}` : "";
  return `data:text/javascript;charset=utf-8,${encodeURIComponent(source)}${idSearch}`;
}

export function makeWorkerBootstrapBlobUrl(
  url: string,
  type: WorkerOptions["type"] | undefined,
  webviewId = getWebviewId(),
): string {
  const importUrl = bypassVsCodeLocalhostWorkerRouting(url);
  const source = webviewId
    ? `${makeWorkerBootstrapSource(
        importUrl,
        type,
      )}\n//# sourceURL=vscode-worker?id=${encodeURIComponent(webviewId)}`
    : makeWorkerBootstrapSource(importUrl, type);
  const blobUrl = URL.createObjectURL(
    new Blob([source], { type: "text/javascript" }),
  );
  return blobUrl;
}

export function revokeWorkerBootstrapBlobUrl(url: string): void {
  const revokeUrl = new URL(url);
  revokeUrl.search = "";
  revokeUrl.hash = "";
  URL.revokeObjectURL(revokeUrl.toString());
}

export function makeSharedWorkerBootstrapUrl(
  url: string,
  type: WorkerOptions["type"] | undefined,
  webviewId = getWebviewId(),
): string {
  return makeWorkerBootstrapUrl(url, type, webviewId);
}
