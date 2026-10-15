import type { DisplayModel } from "@getpochi/common/vscode-webui-bridge";
// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSelectedModels } from "./use-selected-models";

const mocks = vi.hoisted(() => ({
  updateSubtaskSelectedModel: vi.fn(),
  updateSelectedModel: vi.fn(),
  selectedModel: { id: "public-model", name: "Public model" } as
    | { id: string; name: string }
    | undefined,
  modelAccess: {
    superModels: true,
    isLoading: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  },
  superModel: {
    id: "super-model",
    name: "Super model",
    type: "vendor",
    vendorId: "pochi",
    modelId: "super-model",
    options: { label: "super" },
  } as DisplayModel,
  publicModel: {
    id: "public-model",
    name: "Public model",
    type: "vendor",
    vendorId: "pochi",
    modelId: "public-model",
    options: {},
  } as DisplayModel,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@/lib/hooks/use-model-list", () => ({
  useModelList: () => ({
    modelList: [mocks.superModel, mocks.publicModel],
    isLoading: false,
    isFetching: false,
  }),
}));
vi.mock("@/lib/hooks/use-model-access", () => ({
  useModelAccess: () => mocks.modelAccess,
}));
vi.mock("../store", () => ({
  useSettingsStore: () => ({
    selectedModel: mocks.selectedModel,
    subtaskSelectedModel: {
      id: "internal-explore",
      name: "internal-explore",
    },
    updateSelectedModel: mocks.updateSelectedModel,
    updateSubtaskSelectedModel: mocks.updateSubtaskSelectedModel,
  }),
}));

describe("useSelectedModels", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.selectedModel = {
      id: mocks.publicModel.id,
      name: mocks.publicModel.name,
    };
    mocks.modelAccess = {
      superModels: true,
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: vi.fn(),
    };
  });

  it("waits for model access before choosing an initial model", () => {
    mocks.selectedModel = undefined;
    mocks.modelAccess.isLoading = true;
    renderHook(() => useSelectedModels());
    expect(mocks.updateSelectedModel).not.toHaveBeenCalled();
  });

  it("does not choose an initial model when model access failed to load", () => {
    mocks.selectedModel = undefined;
    mocks.modelAccess.superModels = false;
    mocks.modelAccess.isError = true;
    renderHook(() => useSelectedModels());
    expect(mocks.updateSelectedModel).not.toHaveBeenCalled();
  });

  it("uses server access to choose an initial Super model", () => {
    mocks.selectedModel = undefined;
    renderHook(() => useSelectedModels());
    expect(mocks.updateSelectedModel).toHaveBeenCalledWith({
      id: mocks.superModel.id,
      name: mocks.superModel.name,
    });
  });

  it("chooses a Swift model when the server denies Super access", () => {
    mocks.selectedModel = undefined;
    mocks.modelAccess.superModels = false;
    renderHook(() => useSelectedModels());
    expect(mocks.updateSelectedModel).toHaveBeenCalledWith({
      id: mocks.publicModel.id,
      name: mocks.publicModel.name,
    });
  });

  it("preserves an existing selection when access changes", () => {
    mocks.selectedModel = {
      id: mocks.superModel.id,
      name: mocks.superModel.name,
    };
    mocks.modelAccess.superModels = false;
    renderHook(() => useSelectedModels());
    expect(mocks.updateSelectedModel).not.toHaveBeenCalled();
  });

  it("resolves modelOverride without adding it to the selectable list", () => {
    const modelOverride = {
      id: "internal-explore",
      name: "internal-explore",
    } as DisplayModel;
    const { result } = renderHook(() =>
      useSelectedModels({ isSubTask: true, modelOverride }),
    );

    expect(result.current.selectedModel).toBe(modelOverride);
    expect(
      result.current.groupedModels
        ?.flatMap((group) => group.models)
        .some((model) => model.id === modelOverride.id),
    ).toBe(false);

    act(() => result.current.updateSelectedModelId(modelOverride.id));
    expect(mocks.updateSubtaskSelectedModel).toHaveBeenCalledWith({
      id: modelOverride.id,
      name: modelOverride.name,
    });

    mocks.updateSubtaskSelectedModel.mockClear();
    act(() => result.current.updateSelectedModelId(mocks.publicModel.id));
    expect(mocks.updateSubtaskSelectedModel).toHaveBeenCalledWith({
      id: mocks.publicModel.id,
      name: mocks.publicModel.name,
    });
  });
});
