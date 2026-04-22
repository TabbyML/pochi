export type BuiltinSubAgentInfo =
  | {
      type: "browser";
      sessionId: string;
    }
  | {
      type: "planner";
    }
  | {
      type: "explore";
    }
  | {
      type: "fork";
    };

export const getBuiltinSubAgentInfo = (
  agentType: string | undefined,
  sessionId?: string,
): BuiltinSubAgentInfo | undefined => {
  switch (agentType) {
    case "browser":
      return sessionId ? { type: agentType, sessionId } : undefined;
    case "planner":
    case "explore":
    case "fork":
      return { type: agentType };
    default:
      return undefined;
  }
};
