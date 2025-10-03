import type { CommandUnknownOpts } from "@commander-js/extra-typings";
import { install, uninstall, log, parseEnv } from "tabtab";

interface CompletionItem {
  name: string;
  description?: string;
}

interface CompletionTree {
  [key: string]: CompletionItem[] | CompletionTree;
}

/**
 * Recursively extracts command structure from a Commander.js program
 * to automatically generate completion tree with descriptions
 */
function extractCommandStructure(command: CommandUnknownOpts): CompletionTree {
  const tree: CompletionTree = {};

  try {
    // Extract options from the command
    const options = command.options || [];
    const optionItems: CompletionItem[] = [];
    
    for (const option of options) {
      // Add long form (--option)
      if (option.long) {
        optionItems.push({
          name: option.long,
          description: option.description || undefined,
        });
      }
      // Add short form (-o)
      if (option.short) {
        optionItems.push({
          name: option.short,
          description: option.description || undefined,
        });
      }
    }

    // Add options to tree if any exist
    if (optionItems.length > 0) {
      tree._options = optionItems;
    }

    // Extract subcommands
    const commands = command.commands || [];
    const commandItems: CompletionItem[] = [];
    
    for (const subCommand of commands) {
      try {
        const name = subCommand.name();
        if (name) {
          // Add command to the list with description
          commandItems.push({
            name,
            description: subCommand.description() || undefined,
          });
          
          // Recursively extract subcommand structure
          tree[name] = extractCommandStructure(subCommand);
        }
      } catch (err) {
        // Skip commands that can't be processed
        console.debug("Failed to process subcommand:", err);
      }
    }

    // Add commands to tree if any exist
    if (commandItems.length > 0) {
      tree._commands = commandItems;
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
): CompletionTree {
  return extractCommandStructure(program);
}

/**
 * Converts completion tree to tabtab format
 */
function convertTreeToTabtabFormat(tree: CompletionTree): CompletionItem[] {
  const items: CompletionItem[] = [];
  
  // Add commands
  if (tree._commands && Array.isArray(tree._commands)) {
    items.push(...tree._commands);
  }
  
  // Add options
  if (tree._options && Array.isArray(tree._options)) {
    items.push(...tree._options);
  }
  
  // Note: We don't need to add other keys as commands because they are already
  // included in the _commands array. Adding them here would cause duplicates.
  
  return items;
}

// Initialize completion for the CLI
export function initializeShellCompletion(program: CommandUnknownOpts) {
  if (!program || !program.name()) {
    throw new Error(
      "Program instance with a name is required for auto-completion",
    );
  }

  const programName = program.name();
  const tree = createCompletionTreeFromProgram(program);
  
  // Install tabtab completion
  const completionHandler = () => {
    const env = parseEnv(process.env);
    if (!env.complete) return;
    
    const { line } = env;
    const words = line.split(' ').filter(Boolean);
    
    // Navigate through the tree based on the current command path
    let currentTree = tree;
    let currentIndex = 1; // Skip the program name
    
    // If the line ends with a space, we want to complete the next level
    // If it doesn't end with a space, we want to complete the current partial word
    const endsWithSpace = line.endsWith(' ');
    const maxIndex = endsWithSpace ? words.length : words.length - 1;
    
    while (currentIndex < maxIndex && currentTree[words[currentIndex]]) {
      const nextLevel = currentTree[words[currentIndex]];
      if (typeof nextLevel === 'object' && !Array.isArray(nextLevel)) {
        currentTree = nextLevel as CompletionTree;
        currentIndex++;
      } else {
        break;
      }
    }
    
    // Return completions for the current level
    const completions = convertTreeToTabtabFormat(currentTree);
    return log(completions);
  };

  return {
    install: () => install({ name: programName, completer: programName }),
    uninstall: () => uninstall({ name: programName }),
    completion: completionHandler,
  };
}
