import type {
  DisplayModel,
  ValidCustomAgentFile,
} from "@getpochi/common/vscode-webui-bridge";
// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useCustomAgent } from "./use-custom-agents";

const fixtures = vi.hoisted(() => {
  const credentialModel = {
    id: "public-model",
    name: "Public model",
    type: "vendor",
    vendorId: "pochi",
    modelId: "public-model",
    options: {},
    getCredentials: vi.fn(),
  } as DisplayModel;
  const overrideModel = {
    id: "pochi/fast-model",
    name: "Fast model",
    type: "vendor",
    vendorId: "pochi",
    modelId: "fast-model",
    options: {},
    getCredentials: vi.fn(),
  } as DisplayModel;
  const agent = {
    name: "explore",
    description: "Explore",
    systemPrompt: "Explore",
    filePath: "explore.md",
    isBuiltIn: true,
    model: "internal-explore",
  } satisfies ValidCustomAgentFile;

  return {
    agent,
    credentialModel,
    overrideModel,
    modelList: [credentialModel, overrideModel],
    parentModel: credentialModel,
  };
});

vi.mock("@/features/settings", () => ({
  useSelectedModels: () => ({ selectedModel: fixtures.parentModel }),
}));
vi.mock("./use-model-list", () => ({
  useModelList: () => ({
    modelList: fixtures.modelList,
    isLoading: false,
    isFetching: false,
  }),
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: { value: [fixtures.agent] } }),
}));
vi.mock("../vscode", () => ({
  vscodeHost: {},
}));

describe("useCustomAgent", () => {
  it("keeps a synthesized built-in model referentially stable", () => {
    const { result, rerender } = renderHook(() => useCustomAgent("explore"));
    const firstModel = result.current.customAgentModel;

    rerender();

    expect(result.current.customAgentModel).toBe(firstModel);
  });

  it("prefers modelOverride over customAgent.model and parentModel", () => {
    const { result } = renderHook(() =>
      useCustomAgent("explore", "pochi/fast-model"),
    );

    expect(result.current.customAgentModel).toBe(fixtures.overrideModel);
  });

  it("resolves modelOverride when agentType is omitted", () => {
    const { result } = renderHook(() =>
      useCustomAgent(undefined, "fast-model"),
    );

    expect(result.current.customAgent).toBeUndefined();
    expect(result.current.customAgentModel).toBe(fixtures.overrideModel);
  });

  it("falls back to customAgent.model when modelOverride is not found", () => {
    const { result } = renderHook(() =>
      useCustomAgent("explore", "unknown/missing-model"),
    );

    expect(result.current.customAgentModel?.modelId).toBe("internal-explore");
  });
});
