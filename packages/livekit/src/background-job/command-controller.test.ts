import { describe, expect, it, vi } from "vitest";
import { commandControllerFromTool } from "./command-controller";

describe("commandControllerFromTool", () => {
  it("accepts only an explicit success acknowledgement", async () => {
    const execute = vi.fn().mockResolvedValue({ success: true });
    await expect(commandControllerFromTool(execute).kill("bgjob-cmd-1")).resolves.toBeUndefined();
    expect(execute).toHaveBeenCalledWith("bgjob-cmd-1");
  });
  it.each([false, undefined, {}, { success: false }])("rejects unsuccessful or malformed output %j", async (result) => {
    await expect(commandControllerFromTool(async () => result).kill("bgjob-cmd-1")).rejects.toThrow("Failed to stop");
  });
  it("preserves remote errors", async () => {
    await expect(commandControllerFromTool(async () => ({ error: "Disconnected" })).kill("bgjob-cmd-1")).rejects.toThrow("Disconnected");
  });
});
