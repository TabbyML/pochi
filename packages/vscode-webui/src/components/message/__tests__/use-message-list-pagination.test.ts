import { describe, expect, it } from "vitest";
import {
  MessageListPaginationConfig,
  computePageStart,
  loadEarlier,
  resetPaginationToTail,
  resolvePageStart,
} from "../use-message-list-pagination";

const { partBudget, minInitialMessages } = MessageListPaginationConfig;

function uniformPartCounts(messageCount: number, partsPerMessage: number) {
  return Array.from({ length: messageCount }, () => partsPerMessage);
}

function sumRange(partCounts: number[], start: number) {
  return partCounts.slice(start).reduce((total, count) => total + count, 0);
}

describe("computePageStart", () => {
  it("uses one 60-part budget with a two-message initial floor", () => {
    expect(MessageListPaginationConfig).toEqual({
      partBudget: 60,
      minInitialMessages: 2,
    });
  });

  it("walks backward until the part budget would be exceeded", () => {
    const partCounts = uniformPartCounts(200, 5);

    const start = computePageStart(
      partCounts,
      partCounts.length,
      partBudget,
      minInitialMessages,
    );

    expect(sumRange(partCounts, start)).toBeLessThanOrEqual(partBudget);
    expect(sumRange(partCounts, start - 1)).toBeGreaterThan(partBudget);
    expect(start).toBe(200 - partBudget / 5);
  });

  it("keeps the initial message floor when a single message exceeds the budget", () => {
    const partCounts = uniformPartCounts(50, partBudget * 2);

    const start = computePageStart(
      partCounts,
      partCounts.length,
      partBudget,
      minInitialMessages,
    );

    expect(partCounts.length - start).toBe(minInitialMessages);
  });

  it("mounts the whole history when it fits in the budget", () => {
    const partCounts = uniformPartCounts(4, 5);

    expect(
      computePageStart(
        partCounts,
        partCounts.length,
        partBudget,
        minInitialMessages,
      ),
    ).toBe(0);
  });

  it("returns 0 for an empty history", () => {
    expect(computePageStart([], 0, partBudget, minInitialMessages)).toBe(0);
  });
});

describe("loadEarlier", () => {
  it("moves the start monotonically backward and stops at 0", () => {
    const partCounts = uniformPartCounts(200, 5);
    let state = { startIndex: null as number | null };
    let previous = resolvePageStart(
      state,
      partCounts,
      MessageListPaginationConfig,
    );

    for (let i = 0; i < 100; i++) {
      state = loadEarlier(state, partCounts, MessageListPaginationConfig);
      const current = resolvePageStart(
        state,
        partCounts,
        MessageListPaginationConfig,
      );
      expect(current).toBeLessThan(previous);
      previous = current;
      if (current === 0) break;
    }

    expect(previous).toBe(0);
    expect(
      loadEarlier(state, partCounts, MessageListPaginationConfig).startIndex,
    ).toBe(0);
  });

  it("adds roughly one page of parts per call", () => {
    const partCounts = uniformPartCounts(200, 5);
    const first = resolvePageStart(
      { startIndex: null },
      partCounts,
      MessageListPaginationConfig,
    );

    const next = loadEarlier(
      { startIndex: first },
      partCounts,
      MessageListPaginationConfig,
    ).startIndex;

    expect(next).not.toBeNull();
    expect(sumRange(partCounts, next as number) - partBudget).toBeLessThanOrEqual(
      partBudget,
    );
  });

  it("always advances by at least one message, even past a huge one", () => {
    // Loading must advance even when the previous message exceeds the budget.
    const partCounts = [5, 5, partBudget * 10, 5];

    const next = loadEarlier(
      { startIndex: 3 },
      partCounts,
      MessageListPaginationConfig,
    ).startIndex;

    expect(next).toBe(2);
  });
});

describe("resolvePageStart", () => {
  it("evaluates the initial budget when startIndex is null", () => {
    const partCounts = uniformPartCounts(200, 5);

    expect(
      resolvePageStart(
        { startIndex: null },
        partCounts,
        MessageListPaginationConfig,
      ),
    ).toBe(
      computePageStart(
        partCounts,
        partCounts.length,
        partBudget,
        minInitialMessages,
      ),
    );
  });

  it("keeps a frozen startIndex instead of re-evaluating the budget", () => {
    const partCounts = uniformPartCounts(200, 5);

    // Streaming must not move a frozen page start.
    const grown = [...partCounts.slice(0, -1), 400];

    expect(
      resolvePageStart(
        { startIndex: 120 },
        grown,
        MessageListPaginationConfig,
      ),
    ).toBe(120);
  });

  it("recomputes the tail range when a frozen startIndex is no longer valid", () => {
    const partCounts = uniformPartCounts(40, 5);
    const expectedTail = computePageStart(
      partCounts,
      partCounts.length,
      partBudget,
      minInitialMessages,
    );

    expect(
      resolvePageStart(
        { startIndex: 999 },
        partCounts,
        MessageListPaginationConfig,
      ),
    ).toBe(expectedTail);
    expect(
      resolvePageStart(
        { startIndex: -3 },
        partCounts,
        MessageListPaginationConfig,
      ),
    ).toBe(expectedTail);
    expect(
      resolvePageStart({ startIndex: 5 }, [], MessageListPaginationConfig),
    ).toBe(0);
  });
});

describe("resetPaginationToTail", () => {
  it("drops the frozen index so the next render re-evaluates the budget", () => {
    expect(resetPaginationToTail()).toEqual({ startIndex: null });

    const partCounts = uniformPartCounts(200, 5);
    expect(
      resolvePageStart(
        resetPaginationToTail(),
        partCounts,
        MessageListPaginationConfig,
      ),
    ).toBe(
      computePageStart(
        partCounts,
        partCounts.length,
        partBudget,
        minInitialMessages,
      ),
    );
  });
});
