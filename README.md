<img src="apps/web/public/icon-512.png" width="96" alt="OffSite logo">

# OffSite

Claude Code, Codex and OpenCode in your browser. It uses the same sessions as their CLIs, so you can start in one and resume in the other.

## Usage

```sh
npx offsite
```

## Separate instances

Give each instance its own port and `--dir`.

```sh
npx offsite --port 47850 --dir ~/.offsite-work
```

## Images, videos and audio

OffSite shows images, videos and audio inline when a reply links to a file with Markdown image syntax, like `![Header](/absolute/path/header.png)` or `![Header](./relative/path/header.png)`. Relative paths start at the project folder.

The `show` skill teaches agents this syntax. Add it with:

```sh
npx skills add NazmusSayad/offsite --skill show
```

## Development

```sh
pnpm install
pnpm dev
```

The web app runs at [http://localhost:5173](http://localhost:5173). The server runs on port 47842 and keeps its data in `~/.offsite-dev`, apart from your main instance.
