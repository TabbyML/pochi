import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { getLogger } from "../base";

const app = new Hono();
const logger = getLogger("CorsProxy");

const excludeHeaders = new Set(["origin", "referer", "x-proxy-origin"]);

app.use(cors()).all("*", async (c) => {
  const proxyOrigin = c.req.header("x-proxy-origin");
  if (!proxyOrigin) {
    return c.text("x-proxy-origin header is required", 400);
  }
  const origin = new URL(proxyOrigin);
  const url = new URL(c.req.url);
  url.protocol = origin.protocol;
  url.host = origin.host;
  url.port = origin.port;
  const headers = new Headers();
  for (const [key, value] of c.req.raw.headers) {
    if (!excludeHeaders.has(key.toLowerCase()) && !key.startsWith("sec-")) {
      headers.set(key, value);
    }
  }
  try {
    return await fetch(url, {
      method: c.req.method,
      headers,
      body: c.req.raw.body,
      duplex: "half",
    });
  } catch (err) {
    logger.error("Proxy request failed", err);
    return c.text("Proxy request failed", 500);
  }
});

export interface ProxyServer {
  dispose: () => void;
}

const port = 54343;
let initialized = false;

export function startCorsProxy() {
  if (initialized) {
    throw new Error("Proxy server already initialized");
  }

  initialized = true;

  const server = serve({
    fetch: app.fetch,
    port: 54343,
  });
  return {
    dispose: () => {
      server.close();
    },
  };
}

export function getProxyUrl() {
  return `http://localhost:${port}`;
}
