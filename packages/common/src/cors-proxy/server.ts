import type { AddressInfo } from "node:net";
import { serve } from "@hono/node-server";
import { createNodeWebSocket } from "@hono/node-ws";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { WebSocket } from "ws";
import { getLogger } from "../base";

const app = new Hono();
const logger = getLogger("CorsProxy");

const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

const excludeHeaders = new Set(["origin", "referer", "x-proxy-origin"]);

app.use(cors()).all("*", async (c, next) => {
  // Proxy websocket requests
  if (c.req.header("upgrade") === "websocket") {
    const proxyOrigin = c.req.query("proxy-origin");
    if (!proxyOrigin) {
      logger.error("Missing proxy origin for websocket request");
      return c.text("Missing proxy origin", 400);
    }
    logger.debug(`Proxying websocket request to ${proxyOrigin}`);
    return upgradeWebSocket(() => {
      const proxyWs = new WebSocket(proxyOrigin);
      proxyWs.addEventListener("open", () => {
        logger.debug("Proxy websocket connected");
      });
      proxyWs.addEventListener("error", (err) => {
        logger.error("Proxy websocket error", err);
      });
      return {
        onOpen(_, wsContext) {
          logger.debug("Client websocket connected");
          proxyWs.addEventListener("message", (event) => {
            if (wsContext.readyState === WebSocket.OPEN) {
              // biome-ignore lint/suspicious/noExplicitAny: event.data is complex type from ws
              wsContext.send(event.data as any);
            }
          });
          proxyWs.addEventListener("close", () => {
            logger.debug("Proxy websocket closed");
            wsContext.close();
          });
        },
        onMessage(event) {
          if (proxyWs.readyState === WebSocket.OPEN) {
            proxyWs.send(event.data);
          }
        },
        onClose() {
          logger.debug("Client websocket closed");
          proxyWs.close();
        },
      };
    })(c, next);
  }
  // Proxy http requests
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

export function getCorsProxyPort() {
  return port;
}

export function getWSProxyUrl(url: string) {
  return `ws://localhost:${port}?proxy-origin=${encodeURI(url)}`;
}
