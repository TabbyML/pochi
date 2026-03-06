import ora, { type Ora, type Options } from "ora";

const defaultOutputStream: NodeJS.WritableStream = process.stdout;

export type Spinner = Ora;

export function createSpinner(options?: string | Options): Spinner {
  const opt = typeof options === "string" ? { text: options } : options;
  return ora({
    stream: defaultOutputStream,
    ...opt,
  });
}
