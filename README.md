# sshtty

A terminal in your browser, with groups and tabs, that keeps your shells running.

[![sshtty in action](https://raw.githubusercontent.com/NazmusSayad/sshtty/main/.github/assets/sshtty.gif)](https://github.com/NazmusSayad/sshtty/raw/main/.github/assets/sshtty.mp4)

▶️ [Watch the 1-minute video](https://github.com/NazmusSayad/sshtty/raw/main/.github/assets/sshtty.mp4)

## Quick start

```sh
npx sshtty
```

Then open [http://127.0.0.1:47831](http://127.0.0.1:47831).

Runs on macOS (Apple Silicon and Intel), Linux (x64 and arm64) and Windows (x64).

## Features

- **Groups and tabs.** A tab for every task, a group for every project. Give each group its own logo.
- **Shells that keep running.** Close the browser and reopen it: your terminals are still there, mid-command.
- **Images in the terminal.** Shows both sixel and iTerm2 inline images, on Windows too. Windows Terminal shows sixel but not iTerm2 images.
- **Paste images.** Paste an image and sshtty saves it to a file and types its path. Coding agents like Claude Code and OpenCode pick it up directly.
- **Built for coding agents.** Run Claude Code, OpenCode or any other terminal app, each in its own tab.
- **Themes and fonts.** 9 built-in themes (One Dark Extreme, Dracula, Tokyo Night, Catppuccin Mocha, Nord, Gruvbox Dark, Solarized Dark, GitHub Dark, Rosé Pine), custom colors, and bundled Nerd Fonts with ligatures.
- **Works on your phone.** The layout adapts to small screens.
- **The usual terminal comforts.** Search, clickable links, a large scrollback buffer and a settings page for shell, font, cursor and padding.

## Usage

```sh
sshtty [OPTIONS]
```

| Option          | Default     | Description                                                                 |
| --------------- | ----------- | --------------------------------------------------------------------------- |
| `--host <HOST>` | `127.0.0.1` | Address to listen on                                                        |
| `--port <PORT>` | `47831`     | Port to listen on                                                           |
| `--dir <DIR>`   | `~/.sshtty` | Folder for settings and groups; servers with different folders are separate |
| `--debug`       |             | Write detailed logs and serve them at `/api/debug/logs`                     |

Press Ctrl+C to stop sshtty and end all its terminals.

Run several on different ports, they share groups.

> [!WARNING]
> sshtty has no login. Anyone who can reach its port gets a shell on your machine. Keep the default `127.0.0.1`, and only change `--host` on a network you trust.

## Agent status on tabs

A tab shows a coloured dot when the program in it reports a status: yellow for waiting for you, red for error, green for done, pulsing for working. Its group shows the most urgent one. Programs set it with iTerm2's `OSC 21337` (`printf '\e]21337;status=waiting\a'`, with `working`, `waiting`, `idle`, `done` or `error`), or with `OSC 9;4` progress: `3` working, `4` waiting, `2` error, and `0` after working or waiting means done.

**Claude Code.** Hooks can only send `OSC 9;4`, so add this to `~/.claude/settings.json`:

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "printf '%s' '{\"terminalSequence\":\"\\u001b]9;4;3\\u0007\"}'"
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "printf '%s' '{\"terminalSequence\":\"\\u001b]9;4;3\\u0007\"}'"
          }
        ]
      }
    ],
    "PermissionRequest": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "printf '%s' '{\"terminalSequence\":\"\\u001b]9;4;4\\u0007\"}'"
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "printf '%s' '{\"terminalSequence\":\"\\u001b]9;4;0\\u0007\"}'"
          }
        ]
      }
    ],
    "StopFailure": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "printf '%s' '{\"terminalSequence\":\"\\u001b]9;4;2\\u0007\"}'"
          }
        ]
      }
    ]
  }
}
```

**OpenCode** (macOS and Linux). Save as `~/.config/opencode/plugins/sshtty-status.js`:

```js
import { writeFileSync } from 'node:fs'

function setStatus(status) {
  writeFileSync('/dev/tty', `\x1b]21337;status=${status}\x07`)
}

export const SshttyStatus = async () => ({
  event: async ({ event }) => {
    if (
      event.type === 'session.status' &&
      event.properties.status.type === 'busy'
    )
      setStatus('working')
    if (event.type === 'permission.asked' || event.type === 'question.asked')
      setStatus('waiting')
    if (event.type === 'permission.replied') setStatus('working')
    if (event.type === 'session.idle') setStatus('done')
    if (event.type === 'session.error') setStatus('error')
  },
})
```

Turn the dots off with "Show status badges set by coding agents" in Settings.

## Development

Requires Node.js, pnpm and Rust.

```sh
pnpm install
pnpm dev
pnpm build
```

## Status

sshtty is in its early stages and actively maintained.

## License

[MIT](LICENSE)
