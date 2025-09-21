import omelette from "omelette";

// Define the completion tree for all pochi commands
export function createCompletionTree() {
  return {
    // Main options
    "--prompt": [],
    "-p": [],
    "--max-steps": [],
    "--max-retries": [],
    "--model": [],
    "-m": [],
    "--version": [],
    "-V": [],
    "--help": [],
    "-h": [],

    // Auth command
    auth: {
      status: [],
      login: [],
      logout: [],
      "--help": [],
      "-h": [],
    },

    // Model command
    model: {
      list: [],
      "--help": [],
      "-h": [],
    },

    // MCP command
    mcp: {
      list: [],
      "--help": [],
      "-h": [],
    },

    // Task command
    task: {
      list: {
        "--limit": [],
        "-n": [],
        "--help": [],
        "-h": [],
      },
      "get-share-url": [],
      "--help": [],
      "-h": [],
    },

    // Upgrade command
    upgrade: {
      "--help": [],
      "-h": [],
    },
    // Completion command
    completion: {
      "--help": [],
      "-h": [],
      "--shell": []
    },
  };
}

// Initialize completion for pochi CLI
export function initializeCompletion() {
  const completion = omelette("pochi");
  completion.tree(createCompletionTree());
  completion.init();
  return completion;
}

// Get completion script as string
export function getCompletionScript() {
  const completion = omelette("pochi");
  completion.tree(createCompletionTree());
  return completion.setupShellInitFile();
}

// Re-export the completion command registration
export { registerCompletionCommand } from "./completion/cmd";
