import type * as vscode from "vscode";

export type RequestBody = {
  prompt: string;
  temperature?: number;
  max_tokens?: number;
  stop?: string[];
  model?: string;
};

export type ResponseBody = {
  id: string;
  text: string;
  finish_reason: string;
};

export interface Fetcher {
  fetchCompletion(
    requestId: string,
    requestBody: RequestBody,
    token?: vscode.CancellationToken | undefined,
    timeout?: number,
  ): Promise<ResponseBody | undefined>;
}
