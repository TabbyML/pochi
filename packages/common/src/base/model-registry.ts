/**
 * Single source of truth for model ids pinned in code. Upgrade or replace
 * deprecated models here instead of at call sites.
 */
export const ModelRegistry = {
  /** Pochi server fallback when a chat request doesn't specify a model. */
  pochiServer: "google/gemini-3.1-pro",
  /** Default for the CLI `--model` option. */
  cli: "google/gemini-3.8-flash",
  /** Worktree branch name generation, via the Pochi vendor. */
  generateBranchName: "google/gemini-3.8-flash",
  /** Codex vendor fallback when no model id is given (raw Codex model id). */
  codex: "gpt-5",
  /** Website Live API (raw Gemini Live model id). */
  liveApi: "gemini-live-2.5-flash-preview",
  /**
   * Models pinned by built-in agents, keyed by agent name. Applied when the
   * agent file doesn't declare a `model` in its frontmatter.
   */
  builtinAgents: {
    explore: "google/gemini-3.1-flash-lite",
  } as Partial<Record<string, string>>,
} as const;
