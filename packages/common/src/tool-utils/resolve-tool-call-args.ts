import * as R from "remeda";

export const resolvePochiUri = (path: string, taskId: string) => {
  if (!path.startsWith("pochi:")) {
    return path;
  }

  return path.replace("/-/", `/${taskId}/`);
};

export const resolveToolCallArgs = (args: unknown, taskId: string) => {
  if (!R.isObjectType(args)) {
    return args;
  }

  return R.mapValues(args, (v) => {
    if (typeof v === "string") {
      try {
        return resolvePochiUri(v, taskId);
      } catch (err) {
        return v;
      }
    }
  });
};
