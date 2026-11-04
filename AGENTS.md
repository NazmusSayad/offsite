## Philosophy

Never alter a provider (Claude Code, Codex, OpenCode) or anything around it: its tools, configuration, sessions, files, or database. Use only what the provider offers through its own CLI, SDK, or API. Never store session history in offsite. The provider owns the history, and offsite reads it from the provider.

One exception: search may run `rg` read-only over Claude Code session files to find candidate sessions. The Claude SDK must confirm every result.

Another exception: accounts may read the account holder's name read-only, because no provider exposes it: `oauthAccount.displayName` from Claude Code's `.claude.json`, and the `name` claim of the ID token in Codex's `auth.json`. Read nothing else from those files.

## Guidelines

Never run the main offsite instance. Never run `offsite`, `npx offsite` or `pnpm start`, and never run the server with the default `--dir ~/.offsite`. Never stop or restart it either.

## Dialogs and Menus

Always use the `dialog` skill (`.claude/skills/dialog/SKILL.md`) when adding, changing or reviewing a dialog, alert dialog, popover, hover card, dropdown menu or context menu in the client.

## Dev Server

Always start the dev server with `pnpm dev` from the repository root, unless the user explicitly asks otherwise.
