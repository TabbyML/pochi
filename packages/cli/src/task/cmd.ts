import type { Command } from "@commander-js/extra-typings";
import { registerTaskListCommand } from "./list";
import { registerTaskShareCommand } from "./share";

export function registerTaskCommand(program: Command) {
  const taskCommand = program
    .command("task")
    .description("Manage tasks");

  registerTaskListCommand(taskCommand);
  registerTaskShareCommand(taskCommand);

  return taskCommand;
}