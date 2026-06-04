// This file is overwritten by `scripts/build-cli.sh` at `bun build --compile`
// time with static `import "..." with { type: "file" }` statements for every
// built-in skill / agent markdown file. The bundler picks them up via the
// transitive import below and embeds them into the binary, so
// `Bun.embeddedFiles` is populated at runtime.
//
// In dev / `--target node` builds this file stays empty and the loaders in
// `builtin-skills-dir.ts` / `builtin-agents-dir.ts` fall back to the
// on-disk resolution paths.
export {};
