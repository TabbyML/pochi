import { act, fireEvent, render, screen } from "@testing-library/react";
import { type RefObject, useEffect, useState } from "react";
import { describe, expect, it } from "vitest";
import {
  ComparisonPanel,
  MeasuredProfiler,
  PerfPanel,
  usePerfHarness,
} from "../perf-harness";

function HarnessProbe() {
  const perf = usePerfHarness();

  return (
    <div ref={perf.rootRef}>
      <PerfPanel recordsRef={perf.recordsRef} onClear={perf.clear} />
      <MeasuredProfiler id="HarnessProbe" record={perf.record}>
        <div>profiled content</div>
      </MeasuredProfiler>
    </div>
  );
}

function InitialMountComparisonProbe() {
  const perf = usePerfHarness();
  const variants: [string, string] = ["Plain", "Virtualized"];

  return (
    <div ref={perf.rootRef}>
      <ComparisonPanel
        recordsRef={perf.recordsRef}
        variants={variants}
        onClear={perf.clear}
      />
      <MeasuredProfiler
        id="PlainProbe"
        record={perf.record}
        comparisonKey="initial mount probe"
        variant="Plain"
      >
        <div>plain content</div>
      </MeasuredProfiler>
      <MeasuredProfiler
        id="VirtualizedProbe"
        record={perf.record}
        comparisonKey="initial mount probe"
        variant="Virtualized"
      >
        <div>virtualized content</div>
      </MeasuredProfiler>
    </div>
  );
}

function InitialMountDedupeProbe() {
  const perf = usePerfHarness();
  const [mounted, setMounted] = useState(true);

  return (
    <div>
      <InitialMountRecordCount recordsRef={perf.recordsRef} />
      <button type="button" onClick={() => setMounted((value) => !value)}>
        Toggle
      </button>
      {mounted && (
        <MeasuredProfiler
          id="DedupeProbe"
          record={perf.record}
          comparisonKey="initial mount dedupe probe"
          variant="Plain"
        >
          <div>dedupe content</div>
        </MeasuredProfiler>
      )}
    </div>
  );
}

function InitialMountRecordCount({
  recordsRef,
}: {
  recordsRef: RefObject<Array<{ comparisonKey?: string; variant?: string }>>;
}) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const syncCount = () => {
      setCount(
        recordsRef.current.filter(
          (record) =>
            record.comparisonKey === "initial mount dedupe probe" &&
            record.variant === "Plain",
        ).length,
      );
    };
    syncCount();
    const intervalId = window.setInterval(syncCount, 20);
    return () => window.clearInterval(intervalId);
  }, [recordsRef]);

  return <output data-testid="initial-mount-record-count">{count}</output>;
}

describe("perf harness", () => {
  it("does not update the profiled story from profiler records", async () => {
    render(<HarnessProbe />);

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 600));
    });

    expect(document.body.textContent).toContain("profiled content");
  });

  it("shows a comparison row from profiler mount records", async () => {
    render(<InitialMountComparisonProbe />);

    expect(await screen.findByText("initial mount probe")).toBeTruthy();
    expect(screen.getByText("Plain")).toBeTruthy();
    expect(screen.getByText("Virtualized")).toBeTruthy();
  });

  it("keeps initial mount comparison records stable after remounts", async () => {
    render(<InitialMountDedupeProbe />);

    await screen.findByText("dedupe content");
    expect(
      (await screen.findByTestId("initial-mount-record-count")).textContent,
    ).toBe("1");

    fireEvent.click(screen.getByText("Toggle"));
    expect(screen.queryByText("dedupe content")).toBeNull();

    fireEvent.click(screen.getByText("Toggle"));
    await screen.findByText("dedupe content");
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 80));
    });

    expect(
      (await screen.findByTestId("initial-mount-record-count")).textContent,
    ).toBe("1");
  });
});
