export type RenderWidgetErrorKind = "internal" | "runtime";

export interface RenderWidgetError {
  kind: RenderWidgetErrorKind;
  message: string;
}

export const MissingWidgetStateError =
  "Widgets must include a top-level <pochi-widget> state container.";
export const InvalidWidgetStateError =
  "Widget state must be JSON-serializable.";

export function normalizeRenderWidgetError(
  message: string,
  kind?: RenderWidgetErrorKind,
): RenderWidgetError {
  return {
    kind: kind ?? inferRenderWidgetErrorKind(message),
    message,
  };
}

export function inferRenderWidgetErrorKind(
  message: string,
): RenderWidgetErrorKind {
  return message === MissingWidgetStateError ||
    message === InvalidWidgetStateError
    ? "internal"
    : "runtime";
}

export function getRenderWidgetErrorMessageKey(
  error: Pick<RenderWidgetError, "kind">,
) {
  return error.kind === "internal"
    ? "toolInvocation.widgetInternalError"
    : "toolInvocation.widgetRuntimeError";
}

export function mergeRenderWidgetError(
  current: RenderWidgetError | undefined,
  next: RenderWidgetError,
) {
  if (!current || current.kind === next.kind) {
    return next;
  }

  return next.kind === "internal" ? next : current;
}
