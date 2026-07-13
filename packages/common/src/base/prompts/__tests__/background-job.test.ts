import { describe, expect, it } from "vitest";
import { assertBackgroundJobReadInterval } from "../background-job";

describe("background job prompt helpers", () => {
  it("throws when a running background job output is read too soon", () => {
    expect(() =>
      assertBackgroundJobReadInterval({
        now: 1500,
        previousReadAt: 1000,
        status: "running",
      }),
    ).toThrow(/executeCommand to run `sleep 1`/);
  });

  it("allows the first read", () => {
    expect(() =>
      assertBackgroundJobReadInterval({
        now: 1000,
        status: "running",
      }),
    ).not.toThrow();
  });

  it("allows reads after the threshold", () => {
    expect(() =>
      assertBackgroundJobReadInterval({
        now: 2000,
        previousReadAt: 1000,
        status: "running",
      }),
    ).not.toThrow();
  });

  it("allows non-running background jobs", () => {
    expect(() =>
      assertBackgroundJobReadInterval({
        now: 1500,
        previousReadAt: 1000,
        status: "completed",
      }),
    ).not.toThrow();
  });
});
