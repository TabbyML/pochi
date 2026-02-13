import * as R from "remeda";
import type { BuiltinSubAgentInfo } from "../vscode-webui-bridge";

export class PlannerPermissionError extends Error {
  constructor() {
    super("Planner only able to write pochi://-/plan.md");
  }
}

export const resolvePochiUri = (
  path: string,
  taskId: string,
  builtinSubAgentInfo?: BuiltinSubAgentInfo,
): string => {
  if (!path.startsWith("pochi:")) {
    return path;
  }

  if (builtinSubAgentInfo?.type === "planner" && path !== "pochi://-/plan.md") {
    throw new PlannerPermissionError();
  }

  return path.replace("/-/", `/${taskId}/`);
};

export const resolveToolCallArgs = (
  args: unknown,
  taskId: string,
  builtinSubAgentInfo?: BuiltinSubAgentInfo,
): unknown => {
  if (typeof args === "string") {
    try {
      return resolvePochiUri(args, taskId, builtinSubAgentInfo);
    } catch (err) {
      if (err instanceof PlannerPermissionError) {
        throw err;
      }
      return args;
    }
  }

  if (Array.isArray(args)) {
    return args.map((item) =>
      resolveToolCallArgs(item, taskId, builtinSubAgentInfo),
    );
  }

  if (R.isObjectType(args)) {
    return R.mapValues(args, (v) =>
      resolveToolCallArgs(v, taskId, builtinSubAgentInfo),
    );
  }

  return args;
};
