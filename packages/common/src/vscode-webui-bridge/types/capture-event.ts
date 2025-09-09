export type CaptureEvent =
  | {
      event: "selectWorkflow";
      properties: {
        workflowId: string;
      };
    }
  | {
      event: "executeToolCall";
      properties: {
        toolName: string;
        durationMs: number;
        batched: boolean;
        status: "success" | "error" | "aborted";
      };
    }
  | {
      event: "importThirdPartyRules";
      properties: {
        rulePaths: string[];
      };
    }
  | {
      event: "shareSupport";
      properties: {
        uid: string;
        text: string;
      };
    };
