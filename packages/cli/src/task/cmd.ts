import type { Command } from "@commander-js/extra-typings";
import { registerTaskListCommand } from "./list";
import { registerTaskShareCommand } from "./share";

export function registerTaskCommand(program: Command) {
  const taskCommand = program
    .command("task")
    .description("Manage and interact with tasks.")
    .addHelpCommand(true);

  registerTaskListCommand(taskCommand);
  registerTaskShareCommand(taskCommand);

  return taskCommand;
}
