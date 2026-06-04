// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  installPochiWidgetStateRuntime,
  getWidgetRevealDelayMs,
} from "../renderer-runtime";

describe("render widget renderer runtime", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    // @ts-expect-error reset injected runtime in jsdom
    window.pochi = undefined;
  });

  it("uses a compact reveal stagger while allowing long diagrams to keep revealing", () => {
    expect(getWidgetRevealDelayMs(0)).toBe(0);
    expect(getWidgetRevealDelayMs(1)).toBe(80);
    expect(getWidgetRevealDelayMs(5)).toBe(400);
    expect(getWidgetRevealDelayMs(75)).toBe(6000);
    expect(getWidgetRevealDelayMs(99)).toBe(6000);
  });

  it("syncs initial pochi-widget state to the parent", () => {
    const root = document.createElement("div");
    root.innerHTML = `<pochi-widget state='{"hex":"#b87528"}'></pochi-widget>`;
    document.body.appendChild(root);
    const reportState = vi.fn();

    installPochiWidgetStateRuntime({
      root,
      reportState,
      reportSendMessage: vi.fn(),
      reportError: vi.fn(),
    });

    expect(window.pochi.state).toEqual({ hex: "#b87528" });
    expect(reportState).toHaveBeenCalledWith({ hex: "#b87528" });
  });

  it("defaults missing pochi-widget state to an empty object for widget code", () => {
    const root = document.createElement("div");
    root.innerHTML = "<pochi-widget></pochi-widget>";
    document.body.appendChild(root);
    const reportState = vi.fn();

    installPochiWidgetStateRuntime({
      root,
      reportState,
      reportSendMessage: vi.fn(),
      reportError: vi.fn(),
    });

    expect(window.pochi.state).toEqual({});
    expect(reportState).toHaveBeenCalledWith({});
  });

  it("reports an error when the top-level pochi-widget state container is missing", () => {
    const root = document.createElement("div");
    root.innerHTML = "<section>missing state container</section>";
    document.body.appendChild(root);
    const reportState = vi.fn();
    const reportError = vi.fn();

    installPochiWidgetStateRuntime({
      root,
      reportState,
      reportSendMessage: vi.fn(),
      reportError,
    });

    expect(reportError).toHaveBeenCalledWith(
      "Widgets must include a top-level <pochi-widget> state container.",
    );
    expect(window.pochi.state).toEqual({});
    expect(reportState).toHaveBeenCalledWith({});
  });

  it("updates the top-level custom element state before reporting it", () => {
    const root = document.createElement("div");
    root.innerHTML = `<pochi-widget state='{"hex":"#b87528"}'></pochi-widget>`;
    document.body.appendChild(root);
    const reportState = vi.fn();

    installPochiWidgetStateRuntime({
      root,
      reportState,
      reportSendMessage: vi.fn(),
      reportError: vi.fn(),
    });
    window.pochi.setState({ hex: "#ffffff" });

    const widget = root.querySelector("pochi-widget");
    expect(window.pochi.state).toEqual({ hex: "#ffffff" });
    expect(widget?.getAttribute("state")).toBe('{"hex":"#ffffff"}');
    expect(reportState).toHaveBeenLastCalledWith({ hex: "#ffffff" });
  });

  it("sends messages without bundling widget state", () => {
    const root = document.createElement("div");
    root.innerHTML = `<pochi-widget state='{"city":"beijing"}'></pochi-widget>`;
    document.body.appendChild(root);
    const reportSendMessage = vi.fn();

    installPochiWidgetStateRuntime({
      root,
      reportState: vi.fn(),
      reportSendMessage,
      reportError: vi.fn(),
    });
    window.pochi.setState({ city: "shanghai" });
    window.pochi.sendMessage("show next 15 days weather");

    expect(reportSendMessage).toHaveBeenCalledWith(
      "show next 15 days weather",
    );
  });

  it("keeps custom element state updates in sync with window.pochi.state", () => {
    const root = document.createElement("div");
    root.innerHTML = `<pochi-widget state='{"hex":"#b87528"}'></pochi-widget>`;
    document.body.appendChild(root);

    installPochiWidgetStateRuntime({
      root,
      reportState: vi.fn(),
      reportSendMessage: vi.fn(),
      reportError: vi.fn(),
    });
    const widget = root.querySelector("pochi-widget") as HTMLElement & {
      state: unknown;
    };
    widget.state = { hex: "#ffffff" };

    expect(window.pochi.state).toEqual({ hex: "#ffffff" });
  });

  it("rejects non JSON-serializable state", () => {
    const root = document.createElement("div");
    root.innerHTML = `<pochi-widget state='{}'></pochi-widget>`;
    document.body.appendChild(root);
    const reportState = vi.fn();
    const reportError = vi.fn();

    installPochiWidgetStateRuntime({
      root,
      reportState,
      reportSendMessage: vi.fn(),
      reportError,
    });
    window.pochi.setState({ invalid: () => undefined });

    expect(reportError).toHaveBeenCalledWith(
      "Widget state must be JSON-serializable.",
    );
    expect(reportState).not.toHaveBeenCalledWith({ invalid: expect.anything() });
  });

  it("reports undefined state updates as invalid without throwing to widget code", () => {
    const root = document.createElement("div");
    root.innerHTML = `<pochi-widget state='{}'></pochi-widget>`;
    document.body.appendChild(root);
    const reportError = vi.fn();

    installPochiWidgetStateRuntime({
      root,
      reportState: vi.fn(),
      reportSendMessage: vi.fn(),
      reportError,
    });

    expect(() => window.pochi.setState(undefined)).not.toThrow();
    expect(reportError).toHaveBeenCalledWith(
      "Widget state must be JSON-serializable.",
    );
    expect(window.pochi.state).toEqual({});
  });
});
