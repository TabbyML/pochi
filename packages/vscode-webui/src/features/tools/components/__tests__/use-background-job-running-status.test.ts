// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useBackgroundJobRunningStatus } from "../use-background-job-running-status";

const backgroundCommands = vi.hoisted(() => ({
  current: undefined as Record<string, object> | undefined,
}));

vi.mock("@/lib/hooks/use-background-commands", () => ({
  useBackgroundCommands: () => ({
    backgroundCommands: backgroundCommands.current,
  }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe("useBackgroundJobRunningStatus", () => {
  it("reports running while the host lists the job", () => {
    backgroundCommands.current = { "bgjob-cmd-a": {} };
    const { result } = renderHook(() =>
      useBackgroundJobRunningStatus("bgjob-cmd-a"),
    );
    expect(result.current).toEqual({
      status: "running",
      label: "backgroundTasks.running",
    });
  });

  it("defers to the tool status once the job is gone", () => {
    backgroundCommands.current = {};
    const { result } = renderHook(() =>
      useBackgroundJobRunningStatus("bgjob-cmd-a"),
    );
    expect(result.current).toBeUndefined();
  });

  it("defers to the tool status before the job list loads or without an id", () => {
    backgroundCommands.current = undefined;
    expect(
      renderHook(() => useBackgroundJobRunningStatus("bgjob-cmd-a")).result
        .current,
    ).toBeUndefined();
    backgroundCommands.current = { "bgjob-cmd-a": {} };
    expect(
      renderHook(() => useBackgroundJobRunningStatus(undefined)).result.current,
    ).toBeUndefined();
  });
});
