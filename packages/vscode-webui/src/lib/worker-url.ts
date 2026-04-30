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

export function makeSharedWorkerBootstrapUrl(
  url: string,
  type: WorkerOptions["type"] | undefined,
  webviewId = getWebviewId(),
): string {
  return makeWorkerBootstrapUrl(url, type, webviewId);
}
