# VSCode WebUI Render Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add measurable Storybook performance coverage for long diffs and long tool output, then use those measurements to guide targeted rendering optimizations in `vscode-webui`.

**Architecture:** Storybook perf stories provide repeatable stress fixtures and in-page metrics for render time, expand latency, DOM node count, long tasks, and frame stalls. Optimizations are applied behind existing components (`DiffViewer`, `MessageList`, `FileList`, `UserEditsPart`, and tool detail containers) so production behavior stays the same while expensive offscreen or collapsed content does less work.

**Tech Stack:** React 19, Storybook, `@pierre/diffs`, Radix ScrollArea, browser `PerformanceObserver`, `React.Profiler`, optional `@tanstack/react-virtual` only if FileList data proves it is needed.

---

## Current Findings

- `DiffViewer` renders `PatchDiff` directly inside a `max-h-60 overflow-auto` container. `max-h-60` is 240px; with `--diffs-font-size: 11px` and `--diffs-line-height: 1.5`, only about 12-15 lines are visible.
- `@pierre/diffs/react` already exports `Virtualizer`. `PatchDiff` detects this context and uses `VirtualizedFileDiff`; without it, it uses plain `FileDiff`.
- `writeToFile`, `applyDiff`, and `multiApplyDiff` display `result._meta.edit` through `ModelEdits`, which renders `DiffViewer`. A large `plan.md` created by `writeToFile` can therefore generate a multi-thousand-line patch in the chat UI.
- `globFiles` and `searchFiles` return at most 500 items. `listFiles` returns at most 1500 items. All three render through `FileList`, whose viewport is only `max-h-[100px]` but whose current implementation maps every item.
- `MessageList` maps all messages. `content-visibility: auto` can reduce browser layout/paint for offscreen message wrappers, but it will not reduce React render or JS parsing work.
- `UserEditsPart` repeatedly scans diff strings with regex to compute added/removed line counts.
- MCP tool detail can construct expensive JSON/code/markdown details even when collapsed.

## Measurement Strategy

All performance work starts with Storybook measurements. The stories should be deterministic and usable both manually and in future automated checks.

### Metrics

- `mountActualDuration`: React Profiler `actualDuration` for initial mount.
- `updateActualDuration`: React Profiler `actualDuration` for updates such as toggling wrap or view mode.
- `expandMs`: wall-clock time from clicking expand to two `requestAnimationFrame` ticks after the state update.
- `collapseMs`: wall-clock time from clicking collapse to two `requestAnimationFrame` ticks after the state update.
- `nodeCountBefore`: DOM node count in the measured region before action.
- `nodeCountAfter`: DOM node count in the measured region after action.
- `longTaskCount`: number of `longtask` entries observed during a measured action.
- `longTaskTotalMs`: sum of long task durations during a measured action.
- `longTaskMaxMs`: maximum single long task duration during a measured action.
- `worstFrameMs`: maximum RAF frame gap during a scroll or interaction sample.
- `droppedFramesOver32ms`: number of sampled frame gaps above 32ms.
- `droppedFramesOver50ms`: number of sampled frame gaps above 50ms.

### In-Page Instrumentation

Create a small Storybook-only perf harness rather than adding production dependencies.

Files:

- Create `packages/vscode-webui/src/__stories__/perf/perf-harness.tsx`
- Create `packages/vscode-webui/src/__stories__/perf/fixtures.ts`
- Create `packages/vscode-webui/src/__stories__/perf/diff-viewer.perf.stories.tsx`
- Create `packages/vscode-webui/src/__stories__/perf/message-list.perf.stories.tsx`
- Create `packages/vscode-webui/src/__stories__/perf/file-list.perf.stories.tsx`
- Create `packages/vscode-webui/src/__stories__/perf/tool-diff.perf.stories.tsx`

The harness should expose:

```tsx
type PerfRecord = {
  label: string;
  mountActualDuration?: number;
  updateActualDuration?: number;
  expandMs?: number;
  collapseMs?: number;
  nodeCountBefore?: number;
  nodeCountAfter?: number;
  longTaskCount?: number;
  longTaskTotalMs?: number;
  longTaskMaxMs?: number;
  worstFrameMs?: number;
  droppedFramesOver32ms?: number;
  droppedFramesOver50ms?: number;
};
```

Use `React.Profiler`:

```tsx
<Profiler
  id={id}
  onRender={(_, phase, actualDuration, baseDuration, startTime, commitTime) => {
    record({
      label: `${id}:${phase}`,
      mountActualDuration: phase === "mount" ? actualDuration : undefined,
      updateActualDuration: phase === "update" ? actualDuration : undefined,
    });
  }}
>
  {children}
</Profiler>
```

Measure expand/collapse with two animation frames:

```ts
async function afterTwoFrames() {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

async function measureAction(label: string, action: () => void, root: HTMLElement) {
  const nodeCountBefore = root.querySelectorAll("*").length;
  const t0 = performance.now();
  action();
  await afterTwoFrames();
  const nodeCountAfter = root.querySelectorAll("*").length;
  record({ label, expandMs: performance.now() - t0, nodeCountBefore, nodeCountAfter });
}
```

Observe long tasks:

```ts
const observer = new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    addLongTask(entry.startTime, entry.duration);
  }
});

observer.observe({ type: "longtask", buffered: true });
```

Sample frame gaps:

```ts
function sampleFrames(durationMs = 2000): Promise<{
  worstFrameMs: number;
  droppedFramesOver32ms: number;
  droppedFramesOver50ms: number;
}> {
  return new Promise((resolve) => {
    const frames: number[] = [];
    let last = performance.now();
    const end = last + durationMs;

    function tick(now: number) {
      frames.push(now - last);
      last = now;
      if (now < end) {
        requestAnimationFrame(tick);
      } else {
        resolve({
          worstFrameMs: Math.max(...frames),
          droppedFramesOver32ms: frames.filter((x) => x > 32).length,
          droppedFramesOver50ms: frames.filter((x) => x > 50).length,
        });
      }
    }

    requestAnimationFrame(tick);
  });
}
```

## Task 1: Add Storybook Perf Harness

**Reason:** We need repeatable measurements before optimizing, otherwise DiffViewer virtualization and message-level CSS changes are guesswork.

**Files:**

- Create `packages/vscode-webui/src/__stories__/perf/perf-harness.tsx`
- Create `packages/vscode-webui/src/__stories__/perf/fixtures.ts`
- Create `packages/vscode-webui/src/__stories__/perf/diff-viewer.perf.stories.tsx`
- Create `packages/vscode-webui/src/__stories__/perf/tool-diff.perf.stories.tsx`
- Create `packages/vscode-webui/src/__stories__/perf/message-list.perf.stories.tsx`
- Create `packages/vscode-webui/src/__stories__/perf/file-list.perf.stories.tsx`

- [ ] **Step 1: Create deterministic fixtures**

In `fixtures.ts`, add helpers:

```ts
export function makeAddedFilePatch(filePath: string, lineCount: number) {
  const lines = Array.from({ length: lineCount }, (_, index) => {
    const n = index + 1;
    return `+${String(n).padStart(5, "0")} section ${n}: ${"plan content ".repeat(8)}`;
  });

  return [
    `diff --git a/${filePath} b/${filePath}`,
    "new file mode 100644",
    "index 0000000..1111111",
    "--- /dev/null",
    `+++ b/${filePath}`,
    `@@ -0,0 +1,${lineCount} @@`,
    ...lines,
    "",
  ].join("\n");
}

export function makeReplaceFilePatch(filePath: string, lineCount: number) {
  const removed = Array.from(
    { length: lineCount },
    (_, index) => `-${String(index + 1).padStart(5, "0")} old plan content ${index + 1}`,
  );
  const added = Array.from(
    { length: lineCount },
    (_, index) => `+${String(index + 1).padStart(5, "0")} new plan content ${index + 1}`,
  );

  return [
    `diff --git a/${filePath} b/${filePath}`,
    "index 1111111..2222222 100644",
    `--- a/${filePath}`,
    `+++ b/${filePath}`,
    `@@ -1,${lineCount} +1,${lineCount} @@`,
    ...removed,
    ...added,
    "",
  ].join("\n");
}

export function makeFileMatches(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    file: `packages/example/src/generated/file-${String(index).padStart(5, "0")}.tsx`,
    line: index + 1,
    context: `match context for generated file ${index + 1}`,
  }));
}
```

- [ ] **Step 2: Create `PerfPanel` and `MeasuredProfiler`**

`PerfPanel` should render a compact table with the latest records and buttons to clear metrics. `MeasuredProfiler` should wrap children with `React.Profiler` and push records into the panel state.

- [ ] **Step 3: Add Long Diff story**

`diff-viewer.perf.stories.tsx` should include controls:

- `lineCount`: `1000 | 5000 | 10000`
- `patchType`: `"added" | "replace"`
- `wrap`: boolean if practical through the UI, or by clicking the existing wrap control manually

Render `DiffViewer` inside `MeasuredProfiler`.

- [ ] **Step 4: Add Tool Diff expand/collapse story**

`tool-diff.perf.stories.tsx` should simulate the `writeToFile` UI path by rendering `writeToFileTool` or the same `ExpandableToolContainer` + `ModelEdits` structure. The story must start collapsed and expose measured `Expand` and `Collapse` buttons.

- [ ] **Step 5: Add MessageList long-history story**

Generate 100, 300, and 1000 messages with mixed text, tool parts, and optional diff-heavy entries. It should exercise the same `MessageList` wrapper used in production.

- [ ] **Step 6: Add FileList story**

Generate 500 and 1500 `matches` and render `FileList` in a measured region.

- [ ] **Step 7: Run Storybook**

Run:

```bash
bun --filter @getpochi/vscode-webui storybook
```

Expected: Storybook opens without type/runtime errors and the perf stories render controls and metrics.

- [ ] **Step 8: Record baseline numbers**

For each story, run each action three times and record the median in this table:

| Scenario | expandMs | actualDuration | nodes after | long tasks count | long tasks max | worst frame |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| DiffViewer 1k added | | | | | | |
| DiffViewer 5k added | | | | | | |
| DiffViewer 10k added | | | | | | |
| writeToFile 5k expand | | | | | | |
| MessageList 300 | | | | | | |
| MessageList 1000 | | | | | | |
| FileList 500 | | | | | | |
| FileList 1500 | | | | | | |

## Task 2: DiffViewer Virtualization

**Reason:** Large `writeToFile` and `applyDiff` outputs render thousands of diff rows even though the visible viewport is about 12-15 rows.

**Files:**

- Modify `packages/vscode-webui/src/components/message/diff-viewer.tsx`
- Update `packages/vscode-webui/src/__stories__/perf/diff-viewer.perf.stories.tsx`
- Update `packages/vscode-webui/src/__stories__/perf/tool-diff.perf.stories.tsx`

- [ ] **Step 1: Import Virtualizer**

Change:

```ts
import { PatchDiff } from "@pierre/diffs/react";
```

to:

```ts
import { PatchDiff, Virtualizer } from "@pierre/diffs/react";
```

- [ ] **Step 2: Add metrics**

Add a stable metrics object near `patchDiffStyle`:

```ts
const patchDiffMetrics = {
  lineHeight: 16.5,
  hunkLineCount: 30,
  diffHeaderHeight: 0,
  hunkSeparatorHeight: 24,
  fileGap: 8,
};
```

These values align with the current CSS: 11px font size * 1.5 line height is 16.5px. `hunkLineCount: 30` gives a practical render chunk for a 240px viewport.

- [ ] **Step 3: Wrap PatchDiff**

Replace:

```tsx
<div className="max-h-60 overflow-auto">
  <PatchDiff
    patch={patch}
    options={patchDiffOptions}
    style={patchDiffStyle}
  />
</div>
```

with:

```tsx
<Virtualizer className="max-h-60 overflow-auto">
  <PatchDiff
    patch={patch}
    options={patchDiffOptions}
    metrics={patchDiffMetrics}
    style={patchDiffStyle}
  />
</Virtualizer>
```

- [ ] **Step 4: Validate default, wrap, unified, and split modes**

Use Storybook manually:

- Default unified, no wrap
- Split, no wrap
- Unified, wrap
- Split, wrap

Expected: no blank diff, no broken scroll, no obvious scroll jumping when toggling wrap.

- [ ] **Step 5: Compare measurements**

Run the baseline table again for DiffViewer and writeToFile scenarios. Expected:

- `nodes after` is substantially lower for 5k/10k line patches.
- `expandMs` and long task duration improve for 5k/10k line patches.
- Small 1k or below may improve less; this is acceptable.

## Task 3: MessageList Content Visibility

**Reason:** Long chat histories keep many message DOM subtrees offscreen. `content-visibility: auto` lets the browser skip style/layout/paint work for offscreen messages.

**Files:**

- Modify `packages/vscode-webui/src/components/message/message-list.tsx`
- Modify `packages/vscode-webui/src/styles.css` or local message CSS if preferred
- Update `packages/vscode-webui/src/__stories__/perf/message-list.perf.stories.tsx`

- [ ] **Step 1: Add message wrapper class**

In `message-list.tsx`, change the message wrapper:

```tsx
className="flex flex-col"
```

to:

```tsx
className="message-list-item flex flex-col"
```

- [ ] **Step 2: Add CSS**

Add:

```css
.message-list-item {
  content-visibility: auto;
  contain-intrinsic-size: auto 240px;
}
```

Use `240px` because many messages are small-to-medium and this avoids extreme scrollbar estimation. If the MessageList perf story shows scroll thumb instability, compare `320px` and `480px`.

- [ ] **Step 3: Validate scroll behavior**

In Storybook:

- Open 300-message and 1000-message stories.
- Scroll from bottom to top and back.
- Confirm no major scrollbar jump, missing content, or broken auto-scroll.

- [ ] **Step 4: Compare measurements**

Expected:

- Lower Layout/Paint time in Chrome Performance for 300/1000 message stories.
- Similar React Profiler time, because this optimization is mostly browser rendering, not React render.

## Task 4: FileList Large List Optimization

**Reason:** `FileList` can receive 500 search/glob results or 1500 list results, but only about 4-6 rows are visible in the `max-h-[100px]` viewport.

**Files:**

- Modify `packages/vscode-webui/src/features/tools/components/file-list.tsx`
- Update `packages/vscode-webui/src/__stories__/perf/file-list.perf.stories.tsx`
- Optional only after measurement: modify `packages/vscode-webui/package.json` to add `@tanstack/react-virtual`

- [ ] **Step 1: Measure current FileList**

Use the FileList perf story for 500 and 1500 items.

If 1500 items are acceptable and do not produce long tasks, stop here and do not add virtualization.

- [ ] **Step 2: Add a simple render cap first**

If current FileList is expensive, add:

```ts
const MaxRenderedFileListItems = 200;
const visibleMatches = matches.slice(0, MaxRenderedFileListItems);
const hiddenCount = Math.max(matches.length - visibleMatches.length, 0);
```

Render `visibleMatches` and add a final muted row:

```tsx
{hiddenCount > 0 && (
  <div className="px-2 py-1 text-muted-foreground text-xs">
    {hiddenCount} more results not shown
  </div>
)}
```

- [ ] **Step 3: Re-measure**

Expected:

- 500 and 1500 item node counts drop.
- UI still communicates truncation clearly.

- [ ] **Step 4: Consider TanStack Virtual only if needed**

If users need full browsing of all 1500 results, add `@tanstack/react-virtual` and implement row virtualization. Do this only after Step 3 proves truncation is insufficient.

## Task 5: UserEdits Diff Statistics Memoization

**Reason:** `UserEditsPart` scans diff strings repeatedly with regex to compute added/removed counts. This cost grows with many large user edits.

**Files:**

- Modify `packages/vscode-webui/src/components/message/user-edits.tsx`
- Update or add a story in `packages/vscode-webui/src/__stories__/perf/message-list.perf.stories.tsx`

- [ ] **Step 1: Add helper**

Add:

```ts
function getDiffStats(diff: string) {
  return {
    added: (diff.match(/^\+/gm) || []).length,
    removed: (diff.match(/^\-/gm) || []).length,
  };
}
```

- [ ] **Step 2: Memoize per-edit stats**

Inside `UserEditsPart`, compute:

```ts
const editStats = useMemo(() => {
  return userEdits.map((edit) => ({
    filepath: edit.filepath,
    stats: getDiffStats(edit.diff),
  }));
}, [userEdits]);

const totalAdded = editStats.reduce((sum, item) => sum + item.stats.added, 0);
const totalRemoved = editStats.reduce((sum, item) => sum + item.stats.removed, 0);
```

- [ ] **Step 3: Pass stats to `UserEditItem`**

Add `stats` to `UserEditItemProps` and remove per-item regex scanning.

- [ ] **Step 4: Re-measure**

Expected: lower update/render cost in user-edits-heavy stories, especially with large diffs.

## Task 6: MCP Detail Lazy Rendering

**Reason:** MCP tool calls can hold large JSON inputs/results. Details should not stringify and render heavy code/markdown blocks until the user expands the tool.

**Files:**

- Modify `packages/vscode-webui/src/features/tools/components/tool-container.tsx`
- Modify `packages/vscode-webui/src/features/tools/components/mcp-tool-call.tsx`
- Optional: update `packages/vscode-webui/src/__stories__/perf/message-list.perf.stories.tsx`

- [ ] **Step 1: Extend ExpandableToolContainer**

Add prop:

```ts
renderExpandableDetail?: () => React.ReactNode;
```

Resolve details only when expanded:

```tsx
const resolvedExpandableDetail = showDetails
  ? (renderExpandableDetail ? renderExpandableDetail() : expandableDetail)
  : undefined;
```

Use `resolvedExpandableDetail` in the render body.

- [ ] **Step 2: Update MCP tool call**

Replace eager `expandableDetail={...}` with:

```tsx
<ExpandableToolContainer
  title={title}
  renderExpandableDetail={() => (
    <McpToolCallDetail
      input={input}
      result={result}
      previewImageLink={previewImageLink}
      setPreviewImageLink={setPreviewImageLink}
    />
  )}
/>
```

Move the existing detail JSX into `McpToolCallDetail`.

- [ ] **Step 3: Validate collapsed cost**

Use a story with a large MCP JSON result. Expected:

- Collapsed mount does not stringify/render large detail.
- Expand still renders the same UI.

## Verification

Run these checks after each implementation task:

```bash
bun --filter @getpochi/vscode-webui tsc
bun --filter @getpochi/vscode-webui test
```

Run Storybook for manual performance checks:

```bash
bun --filter @getpochi/vscode-webui storybook
```

Use Chrome DevTools Performance for final validation:

1. Open the large `writeToFile plan.md` perf story.
2. Start recording.
3. Click expand.
4. Scroll through the diff.
5. Toggle wrap and split view once.
6. Stop recording.

Record:

- Main-thread long tasks.
- Scripting/rendering/painting breakdown.
- FPS track during scroll.
- DOM node count in the story panel.

## Acceptance Criteria

- Storybook includes repeatable perf stories for long DiffViewer, writeToFile expand/collapse, long MessageList, and FileList.
- The perf panel reports React Profiler duration, expand/collapse wall time, DOM node counts, long task count/duration, and frame gap metrics.
- DiffViewer virtualization reduces DOM nodes substantially for 5k and 10k line patches.
- Large `writeToFile plan.md` expansion has fewer or shorter long tasks after virtualization.
- `content-visibility` does not break scroll behavior and reduces browser Layout/Paint time in long MessageList scenarios.
- FileList is either proven acceptable at 500/1500 items or optimized with a render cap/virtualization.
- UserEdits no longer repeats added/removed regex scans for the same diffs during render.
- MCP details are not stringified/rendered while collapsed.

## Rollout Notes

- Implement Storybook metrics first and commit them separately from production optimizations.
- Keep each optimization independently measurable and reversible.
- Do not add `@tanstack/react-virtual` unless FileList stories show a real need after the render cap experiment.
- Treat DiffViewer wrap mode as a required validation case because `@pierre/diffs` supports dynamic height reconciliation, but long wrapped lines may still shift scroll during first measurement.
