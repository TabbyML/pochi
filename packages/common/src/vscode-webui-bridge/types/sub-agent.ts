export type BuiltinSubAgentInfo =
  | {
      type: "browser";
      sessionId: string;
    }
  | {
      type: "planner";
    };
