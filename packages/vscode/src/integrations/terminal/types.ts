export interface ExecuteCommandOptions {
  command: string;
  cwd: string;
  timeout: number;
  abortSignal?: AbortSignal;
  onData?: (data: { output: string; isTruncated: boolean }) => void;
  color?: boolean;
}
