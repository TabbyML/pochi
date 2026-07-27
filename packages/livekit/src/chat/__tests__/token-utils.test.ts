import { beforeEach, describe, expect, it } from "vitest";
import {
  DefaultCjkCharsPerToken,
  DefaultOtherCharsPerToken,
  estimateTokens,
  getTokenCalibrationFactor,
  resetTokenCalibration,
  updateTokenCalibration,
} from "../token-utils";

describe("estimateTokens", () => {
  beforeEach(() => {
    resetTokenCalibration();
  });

  it("estimates non-CJK text using the default chars-per-token ratio", () => {
    const text = "a".repeat(40);
    expect(estimateTokens(text)).toBe(
      Math.ceil(40 / DefaultOtherCharsPerToken),
    );
  });

  it("estimates CJK text using a smaller, denser chars-per-token ratio", () => {
    const text = "你".repeat(40);
    expect(estimateTokens(text)).toBe(Math.ceil(40 / DefaultCjkCharsPerToken));
  });

  it("buckets mixed CJK and non-CJK text separately", () => {
    const other = "a".repeat(40);
    const cjk = "你".repeat(40);
    // Each bucket's chars are divided by its own ratio and summed before
    // rounding, so the combined estimate should match that computation.
    const combined = Math.ceil(
      40 / DefaultOtherCharsPerToken + 40 / DefaultCjkCharsPerToken,
    );
    expect(estimateTokens(other + cjk)).toBe(combined);
  });

  it("estimates CJK text as more tokens per character than plain ASCII of the same length", () => {
    const asciiEstimate = estimateTokens("a".repeat(100));
    const cjkEstimate = estimateTokens("你".repeat(100));
    expect(cjkEstimate).toBeGreaterThan(asciiEstimate);
  });
});

describe("token calibration", () => {
  beforeEach(() => {
    resetTokenCalibration();
  });

  it("defaults to a calibration factor of 1", () => {
    expect(getTokenCalibrationFactor()).toBe(1);
  });

  it("ignores non-positive inputs", () => {
    updateTokenCalibration(0, 100);
    updateTokenCalibration(100, 0);
    updateTokenCalibration(-5, 100);
    expect(getTokenCalibrationFactor()).toBe(1);
  });

  it("nudges the factor up when actual usage exceeds the estimate", () => {
    const before = estimateTokens("a".repeat(400));
    updateTokenCalibration(200, 100);
    const factor = getTokenCalibrationFactor();
    expect(factor).toBeGreaterThan(1);
    const after = estimateTokens("a".repeat(400));
    expect(after).toBeGreaterThan(before);
  });

  it("nudges the factor down when actual usage is below the estimate", () => {
    updateTokenCalibration(50, 100);
    expect(getTokenCalibrationFactor()).toBeLessThan(1);
  });

  it("converges gradually via EMA rather than jumping straight to the new ratio", () => {
    updateTokenCalibration(200, 100); // ratio = 2
    const factor = getTokenCalibrationFactor();
    expect(factor).toBeGreaterThan(1);
    expect(factor).toBeLessThan(2);
  });

  it("converges toward the true ratio (not its sqrt) across repeated samples", () => {
    // Simulate the real call pattern: each sample's "estimated" value is
    // produced by estimateTokens/computeContextWindowUsage using the *current*
    // factor, and the true chars-per-token ratio of the (fixed) underlying
    // text implies actual usage is consistently 2x the raw heuristic.
    const rawEstimate = 100;
    for (let i = 0; i < 200; i++) {
      const calibratedEstimate = rawEstimate * getTokenCalibrationFactor();
      updateTokenCalibration(rawEstimate * 2, calibratedEstimate);
    }
    expect(getTokenCalibrationFactor()).toBeCloseTo(2, 1);
  });

  it("clamps the factor within a bounded range to resist outliers", () => {
    for (let i = 0; i < 50; i++) {
      updateTokenCalibration(10_000, 1);
    }
    expect(getTokenCalibrationFactor()).toBeLessThanOrEqual(3);

    resetTokenCalibration();
    for (let i = 0; i < 50; i++) {
      updateTokenCalibration(1, 10_000);
    }
    expect(getTokenCalibrationFactor()).toBeGreaterThanOrEqual(0.3);
  });
});
