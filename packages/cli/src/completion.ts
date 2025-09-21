import type { CommandUnknownOpts } from "@commander-js/extra-typings";
import omelette, { type TreeValue } from "omelette";

/**
 * Recursively extracts command structure from a Commander.js program
 * to automatically generate completion tree
 */
function extractCommandStructure(command: CommandUnknownOpts): TreeValue {
  const tree: TreeValue = {};

  try {
    // Extract options from the command
    const options = command.options || [];
    for (const option of options) {
      // Add long form (--option)
      if (option.long) {
        tree[option.long] = [];
      }
      // Add short form (-o)
      if (option.short) {
        tree[option.short] = [];
      }
    }

    // Extract subcommands
    const commands = command.commands || [];
    for (const subCommand of commands) {
      try {
        const name = subCommand.name();
        if (name) {
          // Recursively extract subcommand structure
          tree[name] = extractCommandStructure(subCommand);
        }
      } catch (err) {
        // Skip commands that can't be processed
        console.debug("Failed to process subcommand:", err);
      }
    }
  } catch (err) {
    console.debug("Failed to extract command structure:", err);
  }

  return tree;
}

/**
 * Automatically generates completion tree from CLI program structure
 */
export function createCompletionTreeFromProgram(
  program: CommandUnknownOpts,
): TreeValue {
  return extractCommandStructure(program);
}

// Initialize completion for pochi CLI
export function initializeCompletion(program: CommandUnknownOpts) {
  if (!program) {
    throw new Error("Program instance is required for auto-completion");
  }
  const completion = omelette("pochi");
  const tree = createCompletionTreeFromProgram(program);
  completion.tree(tree);
  completion.init();
  return completion;
}

// Re-export the completion command registration
export { registerCompletionCommand } from "./completion/cmd";
