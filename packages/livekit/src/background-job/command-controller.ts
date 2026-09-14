import type { BackgroundCommandController } from "./manager";

/** Converts the remote kill tool protocol at the adapter boundary. */
export function commandControllerFromTool(
  execute: (id: string) => Promise<unknown>,
): BackgroundCommandController {
  return {
    async kill(id) {
      const result = await execute(id);
      if (typeof result === "object" && result !== null) {
        if ("error" in result) throw new Error(String(result.error));
        if ("success" in result && result.success === true) return;
      }
      throw new Error(`Failed to stop background command "${id}".`);
    },
  };
}
