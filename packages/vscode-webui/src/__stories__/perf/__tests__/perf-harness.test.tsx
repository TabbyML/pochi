import { act, fireEvent, render, screen } from "@testing-library/react";
import { useEffect, useRef, useState } from "react";
import { describe, expect, it } from "vitest";
import {
  ComparisonPanel,
  MeasuredProfiler,
  PerfPanel,
  useAutoMeasureOnMount,
  usePerfHarness,
  waitForPerfElementCount,
  waitForStablePerfElementCount,
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
      <MeasuredProfiler id="PlainProbe" record={perf.record}>
        <div>plain content</div>
      </MeasuredProfiler>
      <MeasuredProfiler id="VirtualizedProbe" record={perf.record}>
        <div>virtualized content</div>
      </MeasuredProfiler>
    </div>
  );
}

function ActionComparisonProbe() {
  const perf = usePerfHarness();
  const variants: [string, string] = ["Plain", "Virtualized"];

  return (
    <div ref={perf.rootRef}>
      <ComparisonPanel
        recordsRef={perf.recordsRef}
        variants={variants}
        onClear={perf.clear}
      />
      <button
        type="button"
        onClick={() => {
          void perf.measureAction("Plain remount", () => {}, {
            comparisonKey: "remount probe",
            variant: "Plain",
          });
          void perf.measureAction("Virtualized remount", () => {}, {
            comparisonKey: "remount probe",
            variant: "Virtualized",
          });
        }}
      >
        Run
      </button>
    </div>
  );
}

function RichComparisonProbe() {
  const perf = usePerfHarness();
  const variants: [string, string] = ["Plain", "Virtualized"];

  useEffect(() => {
    perf.record({
      label: "Plain mount",
      comparisonKey: "mount probe",
      variant: "Plain",
      actionMs: 100,
      nodeCountBefore: 0,
      nodeCountAfter: 300,
      longTaskCount: 2,
      longTaskMaxMs: 80,
      longTaskTotalMs: 130,
      worstFrameMs: 44,
      droppedFramesOver32ms: 1,
      droppedFramesOver50ms: 0,
    });
    perf.record({
      label: "Virtualized mount",
      comparisonKey: "mount probe",
      variant: "Virtualized",
      actionMs: 40,
      nodeCountBefore: 0,
      nodeCountAfter: 60,
      longTaskCount: 1,
      longTaskMaxMs: 20,
      longTaskTotalMs: 20,
      worstFrameMs: 18,
      droppedFramesOver32ms: 0,
      droppedFramesOver50ms: 0,
    });
  }, [perf]);

  return (
    <ComparisonPanel
      recordsRef={perf.recordsRef}
      variants={variants}
      onClear={perf.clear}
    />
  );
}

function ShadowDomComparisonProbe() {
  const perf = usePerfHarness();
  const baselineRef = useRef<HTMLDivElement | null>(null);
  const virtualizedRef = useRef<HTMLDivElement | null>(null);
  const variants: [string, string] = ["Plain", "Virtualized"];

  const appendShadowNode = (target: HTMLDivElement | null) => {
    if (!target) return;
    target.replaceChildren();
    const host = document.createElement("div");
    const shadowRoot = host.attachShadow({ mode: "open" });
    const wrapper = document.createElement("span");
    const child = document.createElement("b");
    wrapper.append(child);
    shadowRoot.append(wrapper);
    target.append(host);
  };

  const appendLightNode = (target: HTMLDivElement | null) => {
    if (!target) return;
    target.replaceChildren();
    target.append(document.createElement("span"));
  };

  return (
    <div>
      <ComparisonPanel
        recordsRef={perf.recordsRef}
        variants={variants}
        onClear={perf.clear}
      />
      <div ref={baselineRef} />
      <div ref={virtualizedRef} />
      <button
        type="button"
        onClick={() => {
          void (async () => {
            await perf.measureAction(
              "Plain shadow",
              () => appendShadowNode(baselineRef.current),
              {
                comparisonKey: "shadow probe",
                variant: "Plain",
                target: baselineRef.current,
              },
            );
            await perf.measureAction(
              "Virtualized light",
              () => appendLightNode(virtualizedRef.current),
              {
                comparisonKey: "shadow probe",
                variant: "Virtualized",
                target: virtualizedRef.current,
              },
            );
          })();
        }}
      >
        Run shadow comparison
      </button>
    </div>
  );
}

function AutoMountComparisonProbe() {
  const perf = usePerfHarness();
  const [baselineMounted, setBaselineMounted] = useState(false);
  const [virtualizedMounted, setVirtualizedMounted] = useState(false);
  const baselineRef = useRef<HTMLDivElement | null>(null);
  const virtualizedRef = useRef<HTMLDivElement | null>(null);
  const variants: [string, string] = ["Baseline", "Virtualized"];

  useAutoMeasureOnMount(() => {
    void (async () => {
      await perf.measureAction(
        "Baseline mount",
        () => setBaselineMounted(true),
        {
          comparisonKey: "mount probe",
          variant: "Baseline",
          target: baselineRef.current,
        },
      );
      await perf.measureAction(
        "Virtualized mount",
        () => setVirtualizedMounted(true),
        {
          comparisonKey: "mount probe",
          variant: "Virtualized",
          target: virtualizedRef.current,
        },
      );
    })();
  });

  return (
    <div>
      <ComparisonPanel
        recordsRef={perf.recordsRef}
        variants={variants}
        onClear={perf.clear}
      />
      <section ref={baselineRef}>
        {baselineMounted && <div>baseline content</div>}
      </section>
      <section ref={virtualizedRef}>
        {virtualizedMounted && <div>virtualized content</div>}
      </section>
    </div>
  );
}

function AsyncMeasureActionProbe() {
  const perf = usePerfHarness();
  const targetRef = useRef<HTMLDivElement | null>(null);

  return (
    <div>
      <PerfPanel recordsRef={perf.recordsRef} onClear={perf.clear} />
      <div ref={targetRef} />
      <button
        type="button"
        onClick={() => {
          void perf.measureAction(
            "async mount",
            () => {
              window.setTimeout(() => {
                targetRef.current?.append(
                  document.createElement("span"),
                  document.createElement("b"),
                );
              }, 80);
            },
            {
              target: targetRef.current,
              afterAction: () => waitForPerfElementCount(targetRef, 2, 500),
            },
          );
        }}
      >
        Run async mount
      </button>
    </div>
  );
}

describe("perf harness", () => {
  it("does not update the profiled story from profiler records", async () => {
    render(<HarnessProbe />);

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 600));
    });

    expect(document.body.textContent).toContain("profiled content");
  });

  it("does not show comparison rows from profiler mount records", async () => {
    render(<InitialMountComparisonProbe />);

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 600));
    });

    expect(screen.queryByText("initial mount probe")).toBeNull();
  });

  it("shows comparison rows from measured actions", async () => {
    render(<ActionComparisonProbe />);

    fireEvent.click(screen.getByText("Run"));

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 600));
    });

    expect(screen.getByText("remount probe")).toBeTruthy();
    expect(screen.getAllByText("Plain").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Virtualized").length).toBeGreaterThan(0);
    expect(screen.getByText("Frame budget")).toBeTruthy();
    expect(screen.queryByText("not sampled")).toBeNull();
  });

  it("emphasizes secondary comparison metrics when values exist", async () => {
    render(<RichComparisonProbe />);

    expect(await screen.findByText("DOM nodes")).toBeTruthy();
    expect(screen.getByText("Long tasks")).toBeTruthy();
    expect(screen.getByText("Frame budget")).toBeTruthy();
    expect(screen.getByText("0->300")).toBeTruthy();
    expect(screen.getByText("0->60")).toBeTruthy();
    expect(screen.getByText("max 80.0 / total 130.0 / count 2")).toBeTruthy();
    expect(screen.getByText("worst 44.0 / >32ms 1 / >50ms 0")).toBeTruthy();
    expect(
      screen
        .getByLabelText("Plain DOM nodes comparison")
        .getAttribute("aria-valuenow"),
    ).toBe("300");
    expect(
      screen
        .getByLabelText("Virtualized Long tasks comparison")
        .getAttribute("aria-valuenow"),
    ).toBe("20");
  });

  it("includes shadow DOM descendants in node counts", async () => {
    render(<ShadowDomComparisonProbe />);

    fireEvent.click(screen.getByText("Run shadow comparison"));

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 600));
    });

    expect(screen.getByText("shadow probe")).toBeTruthy();
    expect(screen.getByText("0->3")).toBeTruthy();
    expect(screen.getByText("0->1")).toBeTruthy();
  });

  it("can auto-run a mount comparison after the initial story render", async () => {
    render(<AutoMountComparisonProbe />);

    expect(screen.queryByText("baseline content")).toBeNull();
    expect(screen.queryByText("virtualized content")).toBeNull();

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 600));
    });

    expect(screen.getByText("mount probe")).toBeTruthy();
    expect(screen.getByText("baseline content")).toBeTruthy();
    expect(screen.getByText("virtualized content")).toBeTruthy();
  });

  it("waits for async warmup DOM before running measured actions", async () => {
    const root = document.createElement("div");
    const waiting = waitForPerfElementCount({ current: root }, 2, 500);

    requestAnimationFrame(() => {
      root.append(document.createElement("span"));
      root.append(document.createElement("b"));
    });

    await expect(waiting).resolves.toBe(true);
  });

  it("waits for element counts to stabilize before resolving", async () => {
    const root = document.createElement("div");
    const waiting = waitForStablePerfElementCount(
      { current: root },
      {
        minCount: 2,
        stableMs: 80,
        timeoutMs: 500,
      },
    );

    requestAnimationFrame(() => {
      root.append(document.createElement("span"), document.createElement("b"));
    });
    window.setTimeout(() => {
      root.append(document.createElement("i"));
    }, 40);

    await expect(waiting).resolves.toBe(true);
    expect(root.querySelectorAll("*").length).toBe(3);
  });

  it("waits for async action settling before recording final node counts", async () => {
    render(<AsyncMeasureActionProbe />);

    fireEvent.click(screen.getByText("Run async mount"));

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 700));
    });

    expect(screen.getByText("0->2")).toBeTruthy();
  });
});
