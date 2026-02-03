import { getTerminalEnv } from "@getpochi/common/env-utils";

export const getCommonProcessEnv = () => ({
  ...process.env,
  ...getTerminalEnv(),
});
