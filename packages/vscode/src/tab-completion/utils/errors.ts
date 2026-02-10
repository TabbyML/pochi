export class HttpError extends Error {
  public readonly status: number;
  public readonly statusText: string;
  public readonly text;

  constructor({
    status,
    statusText,
    text,
  }: {
    status: number;
    statusText: string;
    text?: string | undefined;
  }) {
    super(
      `${status} ${statusText}: ${text?.trim() || "No additional details."}`,
    );
    this.name = "HttpError";
    this.status = status;
    this.statusText = statusText;
    this.text = text;
  }
}

export class AbortError extends Error {
  constructor(message?: string) {
    super(message || "Request aborted.");
    this.name = "AbortError";
  }
}

export class TimeoutError extends Error {
  constructor(message?: string) {
    super(message || "Request timed out.");
    this.name = "TimeoutError";
  }
}

export function isTimeoutError(error: unknown) {
  return (
    (error instanceof Error && error.name === "TimeoutError") ||
    (error instanceof HttpError && error.status === 408)
  );
}

export function isCanceledError(error: unknown) {
  return (
    (error instanceof Error && error.name === "AbortError") ||
    (error instanceof HttpError && error.status === 499)
  );
}
