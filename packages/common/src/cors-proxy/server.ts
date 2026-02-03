import type { AddressInfo } from "node:net";
import { serve } from "@hono/node-server";
import { createNodeWebSocket } from "@hono/node-ws";
import { type Context, Hono } from "hono";
import { cors } from "hono/cors";
import { WebSocket } from "ws";
import { getLogger } from "../base";

type ProxyContext = {
  Variables: {
    proxyUrl: string;
  };
};

const app = new Hono<ProxyContext>();
const logger = getLogger("CorsProxy");

const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

const excludeHeaders = new Set(["origin", "referer", "x-proxy-origin"]);

const handleWebSocketProxy = upgradeWebSocket((c: Context<ProxyContext>) => {
  const proxyUrl = c.var.proxyUrl;
  const proxyWs = new WebSocket(proxyUrl);
  // MUST KEEP to prevent crashes
  proxyWs.addEventListener("error", (err) => {
    logger.error("Proxy websocket error", err);
  });
  return {
    onOpen(_, wsContext) {
      proxyWs.addEventListener("message", (event) => {
        if (wsContext.readyState === WebSocket.OPEN) {
          // biome-ignore lint/suspicious/noExplicitAny: event.data is complex type from ws
          wsContext.send(event.data as any);
        }
      });
      proxyWs.addEventListener("close", () => {
        wsContext.close();
      });
    },
    onMessage(event) {
      if (proxyWs.readyState === WebSocket.OPEN) {
        proxyWs.send(event.data);
      }
    },
    onClose() {
      proxyWs.close();
    },
  };
});

async function handleHttpProxy(c: Context<ProxyContext>) {
  const url = new URL(c.var.proxyUrl);
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
}

app
  .use(cors())
  .use(async (c, next) => {
    const proxyUrl = c.req.query("proxy-url");
    if (!proxyUrl) {
      return c.text("proxy-url query param is required", 400);
    }
    c.set("proxyUrl", proxyUrl);
    await next();
  })
  .all("*", async (c, next) => {
    if (c.req.header("upgrade") === "websocket") {
      return handleWebSocketProxy(c, next);
    }
    return handleHttpProxy(c);
  });

export interface ProxyServer {
  dispose: () => void;
}

let port = 0;

export function startCorsProxy() {
  if (port) {
    throw new Error("Proxy server already initialized");
  }

  const server = serve({
    fetch: app.fetch,
    port: 0,
  });

  injectWebSocket(server);

  port = (server.address() as AddressInfo).port;
  logger.debug(`Proxy server started on port ${port}`);
  return {
    port,
    dispose: () => {
      server.close();
    },
  };
}

export function getCorsProxyUrlPrefix() {
  return `http://localhost:${port}?proxy-url=`;
}

export function getCorsProxyUrl(url: string) {
  return getCorsProxyUrlPrefix() + encodeURIComponent(url);
}
