import * as http from "node:http";
import * as https from "node:https";
import type { AddressInfo } from "node:net";
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

let port = 0;

export function startCorsProxy() {
  if (port) {
    throw new Error("Proxy server already initialized");
  }

  const server = serve({
    fetch: app.fetch,
    port: 0,
  });

  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "", "http://localhost");
    const targetUrlStr = url.searchParams.get("target");

    if (!targetUrlStr) {
      logger.error("Missing target URL in upgrade request");
      socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
      socket.destroy();
      return;
    }

    let targetUrl: URL;
    try {
      targetUrl = new URL(targetUrlStr);
    } catch (err: unknown) {
      logger.error("Invalid target URL", targetUrlStr, err);
      socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
      socket.destroy();
      return;
    }

    logger.debug("Proxying upgrade request to", targetUrl.toString());

    const isSecure =
      targetUrl.protocol === "wss:" || targetUrl.protocol === "https:";
    const requestLib = isSecure ? https : http;
    const port = targetUrl.port || (isSecure ? 443 : 80);

    const headers: http.OutgoingHttpHeaders = {};
    for (const key of Object.keys(req.headers)) {
      if (key.toLowerCase().startsWith("sec-websocket")) {
        headers[key] = req.headers[key];
      }
    }

    const proxyReq = requestLib.request({
      hostname: targetUrl.hostname,
      port: port,
      path: targetUrl.pathname + targetUrl.search,
      method: req.method,
      headers: {
        ...headers,
        host: targetUrl.host,
        connection: "Upgrade",
        upgrade: "websocket",
      },
    });

    proxyReq.on("upgrade", (proxyRes, proxySocket, proxyHead) => {
      if (head && head.length > 0) {
        socket.unshift(head);
      }
      if (proxyHead && proxyHead.length > 0) {
        proxySocket.unshift(proxyHead);
      }

      let responseHead = `HTTP/1.1 ${proxyRes.statusCode} ${proxyRes.statusMessage}\r\n`;
      for (const [key, value] of Object.entries(proxyRes.headers)) {
        if (Array.isArray(value)) {
          for (const v of value) {
            responseHead += `${key}: ${v}\r\n`;
          }
        } else if (value) {
          responseHead += `${key}: ${value}\r\n`;
        }
      }
      responseHead += "\r\n";
      socket.write(responseHead);

      socket.pipe(proxySocket);
      proxySocket.pipe(socket);

      proxySocket.on("error", (err: Error) => {
        logger.error("Proxy socket error", err);
        socket.destroy();
      });

      socket.on("error", (err: Error) => {
        logger.error("Client socket error", err);
        proxySocket.destroy();
      });
    });

    proxyReq.on("error", (err: Error) => {
      logger.error("Proxy request error", err);
      if (socket.writable && !socket.writableEnded) {
        socket.write("HTTP/1.1 502 Bad Gateway\r\n\r\n");
      }
      socket.destroy();
    });

    proxyReq.end();
  });

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
