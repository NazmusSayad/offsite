## Philosophy

Never alter a provider (Claude Code, Codex, OpenCode) or anything around it: its tools, configuration, sessions, files, or database. Use only what the provider offers through its own CLI, SDK, or API. Never store session history in offsite. The provider owns the history, and offsite reads it from the provider.

One exception: search may run `rg` read-only over Claude Code session files to find candidate sessions. The Claude SDK must confirm every result.

Another exception: accounts may read the account holder's name, account ID and organization ID read-only, because no provider exposes them: `oauthAccount.displayName`, `oauthAccount.accountUuid` and `oauthAccount.organizationUuid` from Claude Code's `.claude.json`, and the `name`, `chatgpt_user_id` and `chatgpt_account_id` claims of the ID token in Codex's `auth.json`. Read nothing else from those files.

Another exception: linking a Claude account may create symlinks, never junctions, in the account's config directory that point to the shared entries of the base directory, and may create missing shared folders and files in the base directory, and an empty `.keep` file in the shared folders where it has no side effects, because Claude Code removes empty ones. Only remove links and empty folders that are in the way, and rename anything else that is in the way. Never delete or edit anything else.

## Guidelines

Never run the main offsite instance. Never run `offsite`, `npx offsite` or `pnpm start`, and never run the server with the default `--dir ~/.offsite`. Never stop or restart it either.

## Dialogs and Menus

Always use the `dialog` skill (`.claude/skills/dialog/SKILL.md`) when adding, changing or reviewing a dialog, alert dialog, popover, hover card, dropdown menu or context menu in the client.

## Development

For lint fix and format, use `pnpm lint:fix`. Do not use `prettier`.

When a file goes over a lint limit, do not compress code to fit. Prefer moving a self-contained concern to the file where it belongs, or to a new file.

Always start the dev server with `pnpm dev` from the repository root, unless the user explicitly asks otherwise.
