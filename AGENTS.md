## Philosophy

Never alter a provider (Claude Code, Codex, OpenCode) or anything around it: its tools, configuration, sessions, files, or database. Use only what the provider offers through its own CLI, SDK, or API. Never store session history in offsite. The provider owns the history, and offsite reads it from the provider.

## Guidelines

Never run the main offsite instance. Never run `offsite`, `npx offsite` or `pnpm start`, and never run the server with the default `--dir ~/.offsite`. Never stop or restart it either.
