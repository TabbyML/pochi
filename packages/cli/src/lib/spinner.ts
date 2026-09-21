import ora, { type Ora, type Options } from "ora";

const defaultOutputStream: NodeJS.WritableStream = process.stdout;

export type Spinner = Ora;

export function createSpinner(options?: string | Options): Spinner {
  const opt = typeof options === "string" ? { text: options } : options;
  const stream = opt?.stream ?? defaultOutputStream;
  return ora({
    stream,
    ...opt,
    // A newly attached PTY may report zero columns. Ora divides by the width
    // to count wrapped lines, which otherwise makes its clear loop infinite.
    ...("columns" in stream && stream.columns === 0
      ? { isEnabled: false }
      : {}),
  });
}
