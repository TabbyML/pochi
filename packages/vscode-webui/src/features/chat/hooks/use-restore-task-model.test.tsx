import type {
  DisplayModel,
  PochiTaskInfo,
} from "@getpochi/common/vscode-webui-bridge";
import type { Task } from "@getpochi/livekit";
// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useRestoreTaskModel } from "./use-restore-task-model";

const models: DisplayModel[] = [
  {
    id: "pochi/google/gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    type: "vendor",
    vendorId: "pochi",
    modelId: "google/gemini-2.5-flash",
    options: {},
    getCredentials: vi.fn(),
  },
  {
    id: "openai/gpt-5",
    name: "GPT-5",
    type: "provider",
    modelId: "gpt-5",
    baseURL: "https://api.openai.com/v1",
    apiKey: "test",
    contextWindow: 128000,
    maxTokens: 16384,
  } as unknown as DisplayModel,
];

describe("useRestoreTaskModel", () => {
  it("resolves modelId for new-task using resolveModelFromId formats", () => {
    const updateSelectedModelId = vi.fn();
    const info: PochiTaskInfo = {
      type: "new-task",
      uid: "task-1",
      cwd: "/repo",
      modelId: "google/gemini-2.5-flash",
    };

    renderHook(() =>
      useRestoreTaskModel(
        undefined,
        info,
        false,
        updateSelectedModelId,
        models,
      ),
    );

    expect(updateSelectedModelId).toHaveBeenCalledWith(
      "pochi/google/gemini-2.5-flash",
    );
  });

  it("ignores unavailable modelId on new-task and falls back gracefully", () => {
    const updateSelectedModelId = vi.fn();
    const info: PochiTaskInfo = {
      type: "new-task",
      uid: "task-2",
      cwd: "/repo",
      modelId: "nonexistent/model",
    };

    renderHook(() =>
      useRestoreTaskModel(
        undefined,
        info,
        false,
        updateSelectedModelId,
        models,
      ),
    );

    expect(updateSelectedModelId).not.toHaveBeenCalled();
  });

  it("restores task.modelId when info has no modelId", () => {
    const updateSelectedModelId = vi.fn();
    const info: PochiTaskInfo = {
      type: "open-task",
      uid: "task-3",
      cwd: "/repo",
    };
    const task = { id: "task-3", modelId: "openai/gpt-5" } as Task;

    renderHook(() =>
      useRestoreTaskModel(task, info, false, updateSelectedModelId, models),
    );

    expect(updateSelectedModelId).toHaveBeenCalledWith("openai/gpt-5");
  });
});
