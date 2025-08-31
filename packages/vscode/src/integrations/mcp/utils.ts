import http from "node:http";
import https from "node:https";
import type { McpServerConfig } from "@getpochi/common/configuration";
import deepEqual from "fast-deep-equal";
import { isHttpTransport, isStdioTransport } from "./types";

export function readableError(error: unknown): string {
  return typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
    ? error.message
    : JSON.stringify(error);
}

export function shouldRestartDueToConfigChanged(
  old: McpServerConfig,
  current: McpServerConfig,
): boolean {
  return (
    (isStdioTransport(old) && isHttpTransport(current)) ||
    (isHttpTransport(old) && isStdioTransport(current)) ||
    (isStdioTransport(old) &&
      isStdioTransport(current) &&
      !deepEqual(
        {
          command: old.command,
          args: old.args,
          env: old.env,
        },
        {
          command: current.command,
          args: current.args,
          env: current.env,
        },
      )) ||
    (isHttpTransport(old) &&
      isHttpTransport(current) &&
      !deepEqual(
        {
          url: old.url,
          headers: old.headers,
        },
        {
          url: current.url,
          headers: current.headers,
        },
      ))
  );
}

export async function checkUrlIsSseServer(url: string): Promise<boolean> {
  try {
    const parsedUrl = new URL(url);
    const segments = parsedUrl.pathname.split("/");
    // If the URL path contains "sse", we assume it's an SSE server
    if (segments.includes("sse")) {
      return true;
    }

    // Make a GET request to check if the server supports SSE via Content-Type header
    return new Promise((resolve) => {
      const protocol = parsedUrl.protocol === "https:" ? https : http;
      const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (parsedUrl.protocol === "https:" ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        method: "GET",
        headers: {
          // Requesting text/event-stream can help servers identify the desired response type
          Accept: "text/event-stream, */*",
        },
      };

      const req = protocol.request(options, (res) => {
        const contentType = res.headers["content-type"];
        if (contentType?.toLowerCase().includes("text/event-stream")) {
          resolve(true);
        } else {
          resolve(false);
        }

        res.destroy();
      });

      req.on("error", (_err) => {
        resolve(false);
      });

      req.on("timeout", () => {
        req.destroy();
        resolve(false);
      });

      req.setTimeout(5000);
      req.end();
    });
  } catch (e) {
    return false; // If URL parsing fails or other synchronous error
  }
}

export function isToolEnabledChanged(
  oldConfig: McpServerConfig,
  newConfig: McpServerConfig,
): boolean {
  const oldDisabledTools = oldConfig.disabledTools ?? [];
  const newDisabledTools = newConfig.disabledTools ?? [];
  return (
    oldDisabledTools.length !== newDisabledTools.length ||
    !deepEqual(oldDisabledTools, newDisabledTools)
  );
}
