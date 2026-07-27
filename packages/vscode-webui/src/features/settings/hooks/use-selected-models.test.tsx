import type { DisplayModel } from "@getpochi/common/vscode-webui-bridge";
// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useSelectedModels } from "./use-selected-models";

const mocks = vi.hoisted(() => ({
  updateSubtaskSelectedModel: vi.fn(),
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
    modelList: [mocks.publicModel],
    isLoading: false,
    isFetching: false,
  }),
}));
vi.mock("@/lib/hooks/use-paying-plan", () => ({
  usePayingPlan: () => ({
    plan: "pro",
    isFreebieWhitelistedForSuperModel: true,
  }),
}));
vi.mock("../store", () => ({
  useSettingsStore: () => ({
    selectedModel: { id: mocks.publicModel.id, name: mocks.publicModel.name },
    subtaskSelectedModel: {
      id: "internal-explore",
      name: "internal-explore",
    },
    updateSelectedModel: vi.fn(),
    updateSubtaskSelectedModel: mocks.updateSubtaskSelectedModel,
  }),
}));

describe("useSelectedModels", () => {
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
