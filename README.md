# offsite

Claude Code in your browser. It uses the same sessions as the CLI, so you can start in one and resume in the other.

## Usage

Requires Node.js 24+ and [Claude Code](https://code.claude.com), installed and logged in.

```sh
npx offsite
```

Then open the pairing link it prints. It pairs this browser with the server, so only browsers that opened the link can use it.

| Command          | What it does                                                                                     |
| ---------------- | ------------------------------------------------------------------------------------------------ |
| `offsite`        | Starts the server and the web app                                                                |
| `offsite web`    | Same as `offsite`                                                                                |
| `offsite serve`  | Starts only the server, use it from [offsite.sayad.dev](https://offsite.sayad.dev)               |
| `offsite pair`   | Makes a pairing token for another browser and prints its links and a QR code. `--name` labels it |
| `offsite unpair` | Lists paired browsers so you can pick which to unpair                                            |

| Flag         | Default      | What it sets                                                                             |
| ------------ | ------------ | ---------------------------------------------------------------------------------------- |
| `--host`     | `127.0.0.1`  | Address to listen on                                                                     |
| `--port`     | `47841`      | Port to listen on                                                                        |
| `--dir`      | `~/.offsite` | Folder for settings and accounts                                                         |
| `--no-auth`  | auth on      | Accept connections without the pairing token                                             |
| `--no-pair`  | pair on      | Don't create a pairing token or print pairing links on start                             |
| `--fallback` | none         | Address the pairing links add for when this one is unreachable, e.g. a Cloudflare tunnel |

Pairing tokens stay in `tokens.json` inside `--dir`. A running offsite disconnects an unpaired browser within seconds.

> [!WARNING]
> With `--no-auth`, anyone who can reach its port, including any website open in your browser, can run Claude Code and open a terminal on your machine.

Don't use the same session in offsite and the CLI at the same time. Switching between them is fine.

## Separate instances

Give each instance its own port and `--dir`.

```sh
npx offsite --port 47850 --dir ~/.offsite-work
```

## Development

```sh
pnpm install
pnpm dev
```

The web app runs at [http://localhost:5173](http://localhost:5173). The server runs on port 47842 and keeps its data in `~/.offsite-dev`, apart from your main instance.
