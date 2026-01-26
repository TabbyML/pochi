export type CaptureEvent =
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
    }
  | {
      event: "selectCustomAgent";
      properties: {
        customAgentName: string;
      };
    }
  | {
      event: "selectSkill";
      properties: {
        skillName: string;
      };
    };
