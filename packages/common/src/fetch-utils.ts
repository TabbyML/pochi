type FetchInput = Request | URL | string;

function getCorsProxyUrlPrefixFromGlobal() {
  return (
    globalThis as typeof globalThis & {
      POCHI_CORS_PROXY_URL_PREFIX?: string;
    }
  ).POCHI_CORS_PROXY_URL_PREFIX;
}

function getUrlString(input: FetchInput) {
  return input instanceof Request ? input.url : input.toString();
}

export function withCorsProxy(input: FetchInput): FetchInput {
  const proxyPrefix = getCorsProxyUrlPrefixFromGlobal();
  if (!proxyPrefix) {
    return input;
  }

  return new URL(`${proxyPrefix}${encodeURIComponent(getUrlString(input))}`);
}

export const fetchWithCorsProxy: typeof fetch = (input, init) => {
  return fetch(withCorsProxy(input), init);
};
