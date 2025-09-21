import omelette from "omelette";

/**
 * Recursively extracts command structure from a Commander.js program
 * to automatically generate completion tree
 */
function extractCommandStructure(command: any): Record<string, any> {
  const tree: Record<string, any> = {};

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
        const name = typeof subCommand.name === 'function' ? subCommand.name() : subCommand.name;
        if (name && name !== "help") {
          // Recursively extract subcommand structure
          tree[name] = extractCommandStructure(subCommand);
        }
      } catch (err) {
        // Skip commands that can't be processed
        console.debug('Failed to process subcommand:', err);
      }
    }
  } catch (err) {
    console.debug('Failed to extract command structure:', err);
  }

  return tree;
}

/**
 * Automatically generates completion tree from CLI program structure
 */
export function createCompletionTreeFromProgram(program: any): Record<string, any> {
  return extractCommandStructure(program);
}


// Initialize completion for pochi CLI
export function initializeCompletion(program: any) {
  if (!program) {
    throw new Error("Program instance is required for auto-completion");
  }
  const completion = omelette("pochi");
  const tree = createCompletionTreeFromProgram(program);
  completion.tree(tree);
  completion.init();
  return completion;
}

// Get completion script as string
export function getCompletionScript(program: any) {
  if (!program) {
    throw new Error("Program instance is required for completion script generation");
  }
  const completion = omelette("pochi");
  const tree = createCompletionTreeFromProgram(program);
  completion.tree(tree);
  return completion.setupShellInitFile();
}

// Re-export the completion command registration
export { registerCompletionCommand } from "./completion/cmd";
