import * as http from "node:http";
import { getLogger } from "@getpochi/common";
import { getVendor } from "@getpochi/common/vendor";
import type { ClaudeCodeCredentials } from "./types";
import { VendorId } from "./types";

const logger = getLogger(`${VendorId}-proxy`);

export interface ProxyServerConfig {
  port?: number;
  host?: string;
  getCredentials: () => Promise<ClaudeCodeCredentials | undefined>;
}

interface ProxyServer {
  server: http.Server;
  port: number;
  url: string;
}

let proxyInstance: ProxyServer | null = null;

export async function startProxyServer(
  config: ProxyServerConfig,
): Promise<ProxyServer> {
  if (proxyInstance) {
    logger.info("Proxy server already running on port", proxyInstance.port);
    return proxyInstance;
  }

  const port = config.port || 54321;
  const host = config.host || "127.0.0.1";

  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        await handleProxyRequest(req, res, config);
      } catch (error) {
        logger.error("Proxy request failed:", error);
        res.statusCode = 500;
        res.end(JSON.stringify({ error: "Proxy request failed" }));
      }
    });

    server.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "EADDRINUSE") {
        logger.info(`Port ${port} is busy, trying ${port + 1}`);
        server.close();
        config.port = port + 1;
        startProxyServer(config).then(resolve).catch(reject);
      } else {
        reject(error);
      }
    });

    server.listen(port, host, () => {
      const address = server.address();
      const actualPort =
        typeof address === "object" && address ? address.port : port;
      const url = `http://${host}:${actualPort}`;
      logger.info(`Claude Code proxy server started at ${url}`);

      proxyInstance = {
        server,
        port: actualPort,
        url,
      };

      resolve(proxyInstance);
    });
  });
}

export function stopProxyServer(): void {
  if (proxyInstance) {
    proxyInstance.server.close();
    logger.info("Claude Code proxy server stopped");
    proxyInstance = null;
  }
}

export function getProxyUrl(): string | null {
  return proxyInstance?.url || null;
}

async function handleProxyRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  config: ProxyServerConfig,
): Promise<void> {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  const credentials = await config.getCredentials();
  if (!credentials) {
    res.statusCode = 401;
    res.end(JSON.stringify({ error: "No authentication credentials" }));
    return;
  }

  const targetUrl = new URL(req.url || "/", "https://api.anthropic.com");

  const headers: Record<string, string> = {};

  // Browser-specific headers to exclude (make request look like it's from server)
  const excludeHeaders = new Set([
    "x-api-key",
    "origin",
    "referer",
    "sec-fetch-site",
    "sec-fetch-mode",
    "sec-fetch-dest",
    "sec-ch-ua",
    "sec-ch-ua-mobile",
    "sec-ch-ua-platform",
    "anthropic-dangerous-direct-browser-access",
  ]);

  // Copy only safe request headers
  for (const [key, value] of Object.entries(req.headers)) {
    if (!excludeHeaders.has(key.toLowerCase()) && typeof value === "string") {
      headers[key] = value;
    }
  }

  // Override with required headers - make it look like a server request
  headers.host = "api.anthropic.com";
  headers.authorization = `Bearer ${credentials.accessToken}`;
  headers["anthropic-beta"] =
    "oauth-2025-04-20,claude-code-20250219,interleaved-thinking-2025-05-14,fine-grained-tool-streaming-2025-05-14";
  headers["anthropic-version"] = "2023-06-01";

  const body = await collectRequestBody(req);

  logger.debug(`Proxying ${req.method} request to ${targetUrl.toString()}`);

  try {
    const response = await fetch(targetUrl.toString(), {
      method: req.method,
      headers: headers,
      body: body || undefined,
    });

    res.statusCode = response.status;

    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      if (
        !["content-encoding", "content-length", "transfer-encoding"].includes(
          key.toLowerCase(),
        )
      ) {
        responseHeaders[key] = value;
      }
    });

    setCorsHeaders(res, responseHeaders);

    if (response.headers.get("content-type")?.includes("text/event-stream")) {
      res.setHeader("content-type", "text/event-stream");
      res.setHeader("cache-control", "no-cache");
      res.setHeader("connection", "keep-alive");

      const reader = response.body?.getReader();
      if (reader) {
        const decoder = new TextDecoder();

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            res.write(chunk);
          }
        } finally {
          reader.releaseLock();
        }
      }
      res.end();
    } else {
      const responseBody = await response.text();
      res.end(responseBody);
    }
  } catch (error) {
    logger.error("Failed to proxy request:", error);
    res.statusCode = 502;
    res.end(JSON.stringify({ error: "Failed to proxy request" }));
  }
}

function setCorsHeaders(
  res: http.ServerResponse,
  additionalHeaders?: Record<string, string>,
): void {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS, PATCH",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, anthropic-version, anthropic-beta, x-api-key",
    "Access-Control-Max-Age": "86400",
    ...additionalHeaders,
  };

  for (const [key, value] of Object.entries(headers)) {
    res.setHeader(key, value);
  }
}

async function collectRequestBody(
  req: http.IncomingMessage,
): Promise<string | null> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];

    req.on("data", (chunk) => {
      chunks.push(chunk);
    });

    req.on("end", () => {
      if (chunks.length === 0) {
        resolve(null);
      } else {
        resolve(Buffer.concat(chunks).toString());
      }
    });

    req.on("error", () => {
      resolve(null);
    });
  });
}

let proxyStarted = false;

export async function initializeProxy(): Promise<string> {
  if (proxyStarted) {
    const existingUrl = getProxyUrl();
    if (existingUrl) {
      logger.info("Proxy already running at", existingUrl);
      return existingUrl;
    }
  }

  try {
    const proxy = await startProxyServer({
      port: 54321,
      getCredentials: async () => {
        const vendor = getVendor("claude-code");
        const creds = await vendor.getCredentials();
        return creds as ClaudeCodeCredentials | undefined;
      },
    });

    proxyStarted = true;
    process.env.CLAUDE_CODE_PROXY_URL = proxy.url;
    logger.info(`Claude Code proxy auto-started at ${proxy.url}`);

    const cleanup = () => {
      if (proxyStarted) {
        stopProxyServer();
        proxyStarted = false;
        logger.info("Claude Code proxy stopped");
      }
    };

    process.on("exit", cleanup);
    process.on("SIGINT", cleanup);
    process.on("SIGTERM", cleanup);

    return proxy.url;
  } catch (error) {
    logger.error("Failed to auto-start Claude Code proxy:", error);
    throw error;
  }
}
