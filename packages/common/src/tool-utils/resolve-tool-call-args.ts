import * as R from "remeda";

export const resolvePochiUri = (path: string, taskId: string) => {
  if (!path.startsWith("pochi:")) {
    return path;
  }

  return path.replace("/-/", `/${taskId}/`);
};

export const resolveToolCallArgs = (args: unknown, taskId: string): unknown => {
  if (typeof args === "string") {
    try {
      return resolvePochiUri(args, taskId);
    } catch (err) {
      return args;
    }
  }

  if (Array.isArray(args)) {
    return args.map((item) => resolveToolCallArgs(item, taskId));
  }

  if (R.isObjectType(args)) {
    return R.mapValues(args, (v) => resolveToolCallArgs(v, taskId));
  }

  return args;
};
