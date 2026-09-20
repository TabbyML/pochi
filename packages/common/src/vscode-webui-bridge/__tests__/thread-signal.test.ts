import { MessageChannel } from "node:worker_threads";
import { signal } from "@preact/signals-core";
import { ThreadMessagePort } from "@quilted/threads";
import { threadSignal } from "@quilted/threads/signals";
import { expect, it, vi } from "vitest";
import { serializeThreadSignalWithSnapshot } from "../thread-signal";

it("delivers the latest snapshot before start resolves across an asynchronous RPC bridge", async () => {
  const source = signal(0);
  const channel = new MessageChannel();
  const controller = new AbortController();
  const subscription = new AbortController();
  const api = {
    read: async () => serializeThreadSignalWithSnapshot(source),
    ping: async () => {},
  };
  new ThreadMessagePort(channel.port1, {
    exports: api,
    signal: controller.signal,
  });
  const client = new ThreadMessagePort<typeof api>(channel.port2, {
    signal: controller.signal,
  });
  channel.port1.start();
  channel.port2.start();
  try {
    const serialized = await client.imports.read();
    // This update happens after serialization but before the remote subscription.
    source.value = 1;
    let started: unknown;
    const connected = threadSignal(
      {
        ...serialized,
        start(...args) {
          started = serialized.start(...args);
        },
      },
      { signal: subscription.signal },
    );
    await started;
    expect(connected.value).toBe(1);
    source.value = 2;
    await vi.waitFor(() => expect(connected.value).toBe(2));
    subscription.abort();
    await client.imports.ping();
    source.value = 3;
    await client.imports.ping();
    expect(connected.value).toBe(2);
  } finally {
    controller.abort();
    channel.port1.close();
    channel.port2.close();
  }
});
