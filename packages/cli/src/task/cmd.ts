import type { Command } from "@commander-js/extra-typings";
import { Effect, Stream } from "@livestore/utils/effect";
import { createStore } from "../livekit";
import { safeShutdownStore } from "../shutdown";
import { registerTaskListCommand } from "./list";
import { registerTaskShareCommand } from "./share";

export function registerTaskCommand(program: Command) {
  const taskCommand = program
    .command("task")
    .description("Manage and interact with tasks.")
    .addHelpCommand(true);

  taskCommand.hook("preAction", waitForSync);

  registerTaskListCommand(taskCommand);
  registerTaskShareCommand(taskCommand);

  return taskCommand;
}

async function waitForSync() {
  const store = await createStore(process.cwd());

  await Effect.gen(function* (_) {
    while (true) {
      const nextChange = store.syncProcessor.syncState.changes.pipe(
        Stream.take(1),
        Stream.runCollect,
        Effect.as(false),
      );

      const timeout = Effect.sleep("1 second").pipe(Effect.as(true));

      if (yield* Effect.raceFirst(nextChange, timeout)) {
        break;
      }
    }
  }).pipe(Effect.runPromise);

  await safeShutdownStore(store);
}
