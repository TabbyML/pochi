import { APICallError } from "ai";
import { describe, expect, it } from "vitest";
import { toTaskError } from "./task";

describe("toTaskError", () => {
  it("keeps small request body values", () => {
    const error = new APICallError({
      message: "Bad request",
      url: "https://example.com",
      requestBodyValues: { model: "gpt-5.6" },
      isRetryable: false,
    });

    expect(toTaskError(error)).toEqual({
      kind: "APICallError",
      isRetryable: false,
      message: "Bad request",
      requestBodyValues: { model: "gpt-5.6" },
    });
  });

  it("drops oversized request body values", () => {
    const huge = "x".repeat(2_000_000);
    const error = new APICallError({
      message: "string too long",
      url: "https://example.com",
      requestBodyValues: { prompt: huge },
      isRetryable: false,
    });

    const taskError = toTaskError(error);
    expect(taskError.kind).toBe("APICallError");
    expect(
      JSON.stringify(taskError.kind === "APICallError" ? taskError : {}).length,
    ).toBeLessThan(10_000);
    expect(
      taskError.kind === "APICallError"
        ? taskError.requestBodyValues
        : undefined,
    ).toEqual({
      omitted: "requestBodyValues too large",
      size: JSON.stringify({ prompt: huge }).length,
    });
  });

  it("truncates oversized messages", () => {
    const error = new APICallError({
      message: "y".repeat(20_000),
      url: "https://example.com",
      requestBodyValues: null,
      isRetryable: true,
    });

    const taskError = toTaskError(error);
    expect(taskError.message.length).toBeLessThan(4_100);
    expect(taskError.message).toContain("truncated 16000 characters");
  });

  it("keeps the whole task error serializable within the sync payload limit", () => {
    const error = new APICallError({
      message: "z".repeat(5_000_000),
      url: "https://example.com",
      requestBodyValues: { prompt: "w".repeat(5_000_000) },
      isRetryable: false,
    });

    expect(JSON.stringify(toTaskError(error)).length).toBeLessThan(900_000);
  });

  it("maps non-api errors to internal errors", () => {
    expect(toTaskError(new Error("boom"))).toEqual({
      kind: "InternalError",
      message: "boom",
    });
  });
});
