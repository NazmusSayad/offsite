# offsite

A better UI for Claude Code, in your browser. Same sessions as the CLI: start in one, resume in the other.

## Quick start

Requires Node.js 24+, pnpm and [Claude Code](https://code.claude.com) installed and logged in.

```sh
pnpm install
pnpm build
pnpm start
```

Then open [http://127.0.0.1:47841](http://127.0.0.1:47841).

## Features

- **Same sessions as the CLI.** Projects and sessions come straight from `~/.claude/projects`. Sessions started here show up in `claude --resume`, and the other way around.
- **Sessions keep running.** Close the tab and come back; the session is still working.
- **Readable transcripts.** Markdown, tool calls with their output, and file edits as diffs.
- **Prompts in the page.** Approve or deny tool calls, answer Claude's questions and approve plans.
- **Permission modes.** Switch modes from the composer or with Shift+Tab. Esc stops Claude.
- **Your Claude Code setup.** Uses your installed `claude`, with your settings, CLAUDE.md, MCP servers, skills and slash commands.
- **Multiple Claude accounts.** Add accounts with `claude setup-token`, see each one's usage limits, and pick the account per message.
- **A full composer.** Model, effort and mode pickers, `/` commands, `@` file mentions, pasted or dropped images and files, a message queue, and Ctrl/⌘+Enter to steer a running turn.
- **Session management.** Rename, pin, archive and delete sessions, search with Ctrl/⌘+K, and get notified when Claude finishes or needs you.
- **Review and rewind.** A Changes panel with the working tree diff, highlighted code, and rewind or fork from any of your messages, restoring files too.
- **Terminal and git.** A terminal drawer (Ctrl/⌘+J), the branch in the header, and commit (with a message written by Claude), push and pull requests through `gh`.
- **Dark and light themes**, and a layout that works on phones.

## Usage

```sh
node apps/server/dist/main.js [--host 127.0.0.1] [--port 47841] [--dir ~/.offsite]
```

`--dir` is where offsite keeps its settings, accounts and other data. To run a separate instance, give it its own port and folder, and set `CLAUDE_CONFIG_DIR` to also keep its Claude Code sessions and login apart:

```sh
CLAUDE_CONFIG_DIR=~/.claude-work node apps/server/dist/main.js --port 47850 --dir ~/.offsite-work
```

> [!WARNING]
> offsite has no login. Anyone who can reach its port can run Claude Code and open a terminal on your machine. Keep the default `127.0.0.1`.

Avoid using one session in offsite and the CLI at the same time. Switching between them is fine.

## Development

```sh
pnpm install
pnpm dev
```

Opens the web app at [http://localhost:5173](http://localhost:5173), with the server on port 47842, offsite data in `~/.offsite-dev` and Claude Code data in `~/.claude-test`.
