import { describe, expect, test } from "vitest";
import { getTerminalEnv } from "../env-utils";

describe("env-utils", () => {
  test("should include non-interactive terminal guard env vars", () => {
    const env = getTerminalEnv();

    expect(env.PAGER).toBe("cat");
    expect(env.GIT_EDITOR).toBe("true");
    expect(env.GIT_TERMINAL_PROMPT).toBe("0");
    expect(env.GCM_INTERACTIVE).toBe("never");
  });

  test("should keep committer identity env vars", () => {
    const env = getTerminalEnv();

    expect(env.GIT_COMMITTER_NAME).toBe("Pochi");
    expect(env.GIT_COMMITTER_EMAIL).toBe("noreply@getpochi.com");
  });
});
