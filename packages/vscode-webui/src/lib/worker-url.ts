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

export function makeSharedWorkerBootstrapUrl(
  url: string,
  type: WorkerOptions["type"] | undefined,
): string {
  return `data:text/javascript;charset=utf-8,${encodeURIComponent(makeWorkerBootstrapSource(url, type))}`;
}
