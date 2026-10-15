import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { WebSocket, WebSocketServer } from "ws";

vi.mock("../../base", () => ({
  getLogger: () => ({ debug() {}, error() {} }),
}));
import { getCorsProxyUrl, startCorsProxy } from "../server";

const cleanup: (() => void)[] = [];
let proxy: ReturnType<typeof startCorsProxy>;
beforeAll(() => {
  proxy = startCorsProxy();
});
afterEach(() => {
  for (const stop of cleanup.splice(0).reverse()) stop();
});
afterAll(() => proxy.dispose());

async function fixture() {
  const http = createServer((_, response) =>
    response.end("shared HTTP proxy still works"),
  );
  const server = new WebSocketServer({ server: http });
  const requests: { origin?: string; url?: string }[] = [];
  server.on("connection", (_ws, request) => {
    requests.push({ origin: request.headers.origin, url: request.url });
  });
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
  cleanup.push(() => {
    for (const ws of server.clients) ws.terminate();
    server.close();
    http.close();
  });
  const port = (http.address() as AddressInfo).port;
  const streamUrl = getCorsProxyUrl(
    `ws://127.0.0.1:${port}/?pacing=ack`,
  ).replace(/^http:/, "ws:");
  return { server, requests, streamUrl, httpUrl: `http://127.0.0.1:${port}/` };
}

async function connect(upstreamFixture: Awaited<ReturnType<typeof fixture>>) {
  const accepted = once(upstreamFixture.server, "connection");
  const viewer = new WebSocket(upstreamFixture.streamUrl, {
    origin: "vscode-webview://test",
  });
  cleanup.push(() => viewer.terminate());
  await once(viewer, "open");
  const [upstream] = (await accepted) as [WebSocket];
  return { viewer, upstream };
}

describe("browser streams through the shared CORS proxy", () => {
  it("preserves text frames, forwards ACKs, and does not forward the Webview origin", async () => {
    const upstream = await fixture();
    const connection = await connect(upstream);
    const frame = { type: "frame", seq: 42, data: "image" };
    const received = once(connection.viewer, "message");
    connection.upstream.send(JSON.stringify(frame));
    const [data, isBinary] = await received;
    expect(isBinary).toBe(false);
    expect(JSON.parse(data.toString())).toEqual(frame);
    const acknowledged = once(connection.upstream, "message");
    connection.viewer.send(JSON.stringify({ type: "ack", seq: 42 }));
    expect(JSON.parse((await acknowledged)[0].toString())).toEqual({
      type: "ack",
      seq: 42,
    });
    expect(upstream.requests).toEqual([
      { origin: undefined, url: "/?pacing=ack" },
    ]);
  });

  it("closing one viewer leaves another stream and HTTP requests working", async () => {
    const upstream = await fixture();
    const first = await connect(upstream);
    const second = await connect(upstream);
    const closed = once(first.upstream, "close");
    first.viewer.close();
    await closed;
    expect(second.viewer.readyState).toBe(WebSocket.OPEN);
    const received = once(second.viewer, "message");
    second.upstream.send(
      JSON.stringify({ type: "frame", seq: 2, data: "image" }),
    );
    expect(JSON.parse((await received)[0].toString()).seq).toBe(2);
    const response = await fetch(getCorsProxyUrl(upstream.httpUrl));
    expect(await response.text()).toBe("shared HTTP proxy still works");
  });

  it("closes the viewer when the browser upstream closes, then accepts a new session", async () => {
    const upstream = await fixture();
    const first = await connect(upstream);
    const closed = once(first.viewer, "close");
    first.upstream.close();
    await closed;
    const second = await connect(upstream);
    const received = once(second.viewer, "message");
    second.upstream.send(
      JSON.stringify({ type: "frame", seq: 1, data: "new-session" }),
    );
    expect(JSON.parse((await received)[0].toString()).data).toBe("new-session");
  });
});
