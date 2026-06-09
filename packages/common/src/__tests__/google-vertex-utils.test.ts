import { createVertexWithoutCredentials } from "@ai-sdk/google-vertex/edge";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createVertexModel } from "../google-vertex-utils";

const mocks = vi.hoisted(() => ({
  createVertexWithoutCredentials: vi.fn(),
}));

vi.mock("@ai-sdk/google-vertex/edge", () => ({
  createVertex: vi.fn(),
  createVertexWithoutCredentials: mocks.createVertexWithoutCredentials,
}));

describe("Google Vertex utils", () => {
  afterEach(() => {
    vi.resetAllMocks();
    vi.unstubAllGlobals();
    Reflect.deleteProperty(globalThis, "POCHI_CORS_PROXY_URL_PREFIX");
  });

  it("uses the shared CORS proxy fetch for access-token models", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("ok"));
    vi.stubGlobal("fetch", fetchMock);
    globalThis.POCHI_CORS_PROXY_URL_PREFIX = "https://proxy.example/?url=";

    let vertexFetch: typeof fetch | undefined;
    vi.mocked(createVertexWithoutCredentials).mockImplementation((options) => {
      if (!options?.fetch) {
        throw new Error("Expected Vertex fetch option");
      }
      vertexFetch = options.fetch;
      return ((modelId: string) => ({ modelId })) as ReturnType<
        typeof createVertexWithoutCredentials
      >;
    });

    createVertexModel(
      {
        type: "access-token",
        accessToken: "token",
        projectId: "project-id",
        location: "us-central1",
      },
      "gemini-2.5-pro",
    );

    await vertexFetch?.(
      "https://us-central1-aiplatform.googleapis.com/v1/projects/project-id/locations/us-central1/publishers/google/models/gemini-2.5-pro:streamGenerateContent",
      { method: "POST" },
    );

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toEqual(
      new URL(
        "https://proxy.example/?url=https%3A%2F%2Fus-central1-aiplatform.googleapis.com%2Fv1%2Fprojects%2Fproject-id%2Flocations%2Fus-central1%2Fpublishers%2Fgoogle%2Fmodels%2Fgemini-2.5-pro%3AstreamGenerateContent",
      ),
    );
    expect(new Headers(init?.headers).get("Authorization")).toBe(
      "Bearer token",
    );
  });
});
