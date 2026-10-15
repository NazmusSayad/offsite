# offsite

Claude Code in your browser. It uses the same sessions as the CLI, so you can start in one and resume in the other.

## Usage

Requires Node.js 24+ and [Claude Code](https://code.claude.com), installed and logged in.

```sh
npx offsite
```

Then open [http://127.0.0.1:47841](http://127.0.0.1:47841).

| Flag     | Default      | What it sets                     |
| -------- | ------------ | -------------------------------- |
| `--host` | `127.0.0.1`  | Address to listen on             |
| `--port` | `47841`      | Port to listen on                |
| `--dir`  | `~/.offsite` | Folder for settings and accounts |

> [!WARNING]
> offsite has no login. Anyone who can reach its port can run Claude Code and open a terminal on your machine. Keep the default host.

Don't use the same session in offsite and the CLI at the same time. Switching between them is fine.

## Separate instances

Give each instance its own port and `--dir`. Set `CLAUDE_CONFIG_DIR` too if it should have its own Claude Code sessions and login.

```sh
CLAUDE_CONFIG_DIR=~/.claude-work npx offsite --port 47850 --dir ~/.offsite-work
```

## Development

```sh
pnpm install
pnpm dev
```

The web app runs at [http://localhost:5173](http://localhost:5173). The server runs on port 47842 and keeps its data in `~/.offsite-dev` and `~/.claude-test`, apart from your main instance.
