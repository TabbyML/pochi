import type { AutoMemoryManager } from "@getpochi/common/auto-memory/node";
import type { AutoMemoryBackend } from "@getpochi/livekit";

export function createAutoMemoryBackend(
  manager: AutoMemoryManager,
): AutoMemoryBackend {
  return {
    readContext: (cwd) => manager.readContext(cwd),
    writeTaskTranscript: (options) => manager.writeTaskTranscript(options),
    beginDreamRun: async ({ cwd, sessionUpdatedAts, currentTranscript }) => {
      const run = await manager.beginDreamRun({ cwd, sessionUpdatedAts });
      if (!run) return undefined;

      const candidates =
        currentTranscript &&
        currentTranscript.updatedAt > run.previousLastDreamAt
          ? [currentTranscript]
          : [];

      return {
        context: run.context,
        token: run.token,
        previousLastDreamAt: run.previousLastDreamAt,
        candidates,
      };
    },
    finishDreamRun: (options) => manager.finishDreamRun(options),
  };
}
