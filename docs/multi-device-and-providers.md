# Multi-device and multi-provider

This document records the design decisions for two features. The first lets one browser use offsite on several machines. The second adds Codex and OpenCode next to Claude Code. Nothing here is built yet.

Most decisions follow how [t3code](https://github.com/pingdotgg/t3code) does the same thing. Where offsite differs, the reason is usually the same one: offsite stores no conversation data of its own.

## Principles

- Each provider owns its history. Offsite lists and loads sessions through the provider's own API or files and keeps no copy of a transcript.
- Sessions started in a provider's CLI or TUI show up in offsite, and sessions started in offsite can be continued in the CLI or TUI.
- Offsite does no networking for the user. There is no relay, no hosted service, and no login. Making a machine reachable from another device is the user's job.
- Each provider keeps its own concepts, such as its own modes. Offsite does not invent a shared set that fits none of them well.

## Providers

The supported providers are Claude Code, Codex, and OpenCode 2.x. OpenCode 1.x is not supported.

A session belongs to the provider that created it, for its whole life. A Claude session can never move to Codex. A session can move to another account of the same provider when that account is valid (see [Accounts](#accounts)).

### Shared transcript format

Each provider has server-side code that turns its events and its stored history into one shared format. The browser only sees that format and knows nothing about Claude, Codex, or OpenCode message shapes. Claude goes through the same conversion as the others.

The item kinds follow t3code's turn items:

| Group | Kinds |
| --- | --- |
| Conversation | user message, assistant message, reasoning |
| Tools | command, file change, file search, web search, generic tool |
| Special tools | todo list, proposed plan, subagent |
| Requests | approval request, question |
| Status | compaction, error, notice |

A generic tool carries a name, an input, and an output. The UI labels it as read, search, or other from the tool name, as t3code does. Claude's Read, Grep, and Glob are generic tools for this reason.

Codex reads and searches files by running shell commands like `cat` and `rg`. These show as commands, the same as in t3code.

The server sends items as updates keyed by item id ("item X now looks like this"), plus streamed text. This replaces today's model of whole messages plus a text stream, because all three providers report items that change while they run.

How each provider maps to the kinds:

| Kind | Claude | Codex | OpenCode |
| --- | --- | --- | --- |
| command | Bash | `commandExecution` | `shell` |
| file change | Edit, MultiEdit, Write, NotebookEdit | `fileChange` | `edit`, `write`, `patch` |
| file search | | | `grep`, `glob`, `list` |
| web search | WebFetch, WebSearch | `webSearch` | `webfetch`, `websearch` |
| todo list | TodoWrite | `turn/plan/updated` | `todowrite` |
| subagent | Agent, Task | `collabAgentToolCall` | `task` tool with a child session |
| question | AskUserQuestion | `item/tool/requestUserInput` | form |
| proposed plan | ExitPlanMode | `plan` item | none, the `plan` agent replies in text |
| generic tool | Read, Grep, Glob, Skill, MCP tools, the rest | `mcpToolCall`, `dynamicToolCall` | `read`, MCP and custom tools |

### Modes

The selected model decides the provider, and the provider decides which modes the mode picker shows.

| Provider | Modes |
| --- | --- |
| Claude | Its permission modes: `default`, `acceptEdits`, `plan`, `auto`, `bypassPermissions`, `dontAsk` |
| Codex | The CLI's `/approvals` presets, plus a separate Plan switch |
| OpenCode | Its agents from `/api/agent`, such as `build` and `plan` |

The Codex presets map to these settings, sent with every turn:

| Preset | `approvalPolicy` | Sandbox |
| --- | --- | --- |
| Read Only | `on-request` | `readOnly` |
| Auto | `on-request` | `workspaceWrite` |
| Full Access | `never` | `dangerFullAccess` |

The Plan switch sends `collaborationMode: { mode: "plan" }` with the turn.

OpenCode permissions come from the user's own OpenCode config. Offsite does not rewrite them per session, unlike t3code. When a rule says "ask", the prompt shows in offsite as usual.

### Model picker

- A new session's model picker lists the models of every provider, grouped by provider.
- An existing session's model picker lists only its own provider's models.
- The account picker lists only valid accounts of the selected provider. OpenCode has no account picker.
- The last model and mode used are remembered per provider as defaults for new sessions. They live in the machine settings.

### Accounts

| Provider | What an account is | Valid when |
| --- | --- | --- |
| Claude | A `CLAUDE_CONFIG_DIR` folder | Its `projects` folder is linked to the shared one |
| Codex | A `CODEX_HOME` folder | It mirrors `~/.codex` and someone is logged in |
| OpenCode | No accounts. One OpenCode per machine | Always |

Invalid accounts appear in Settings with the problem and a fix (Link, or log in). They never appear in a picker. The default account, which is Claude's base folder or the real `~/.codex`, is always valid because it is the shared folder.

The user logs in to an account in a terminal, as with Claude today. For Codex that is `CODEX_HOME=<folder> codex login`.

A Codex account folder mirrors `~/.codex` the way t3code's "shadow home" does (`apps/server/src/provider/Drivers/CodexHomeLayout.ts` in t3code). Every entry in the folder is a symlink to the same entry in `~/.codex`, with these exceptions:

- `auth.json` and `models_cache.json` stay private to the account.
- `log`, `memories`, and `tmp` stay local to the account.

This shares threads, the thread database, skills, and config across accounts, so a Codex session can move between accounts by resuming its thread on the other account's app-server.

Login detection follows one rule. Offsite only checks a login when it can do so without a network call:

- Codex `account/read` reads the stored login locally (it only refreshes tokens when asked), so a Codex account with no login counts as invalid.
- Claude has no reliable local check. On macOS the login lives in the Keychain. Claude accounts are only checked for linking, and a login problem shows as an error when it happens. If the existing account probe turns out to tell us cleanly, we can use it later.

OpenCode keeps logins for model providers (Anthropic, OpenAI, Zen, and others) itself. The user connects them with `opencode auth login` or the TUI. OpenCode 2.x also has `/api/integration` for connecting providers, which offsite could use later.

### Features by provider

The UI shows what the session's provider supports and hides the rest.

| Feature | Claude | Codex | OpenCode |
| --- | --- | --- | --- |
| Interrupt and steer mid-turn | yes | yes | yes |
| Fork | yes | yes | yes |
| Rewind the conversation | yes | yes, Codex 0.156 or later | yes |
| Rewind restores files | yes | no | yes |
| Open a subagent's conversation | yes | yes | yes |
| Background tasks panel | yes | background terminals only | no |
| Slash commands and skills | yes | skills | commands and skills |
| Compact | yes | yes | yes |
| Context meter | yes | yes | yes |
| Usage limits | yes | yes | no |

Codex's `thread/revert` only changes the conversation history. Its own docs say "It does not revert local file changes." The rewind dialog drops the restore-code option for Codex sessions.

### Commit messages and other one-off calls

One-off calls such as "Write commit message" use the provider of the model selected in the composer. With a Claude model selected, only Claude writes the message. The button names the provider, for example "Write with Codex".

The model for these calls is a per-provider setting in the machine settings:

| Provider | Default |
| --- | --- |
| Claude | Haiku |
| Codex | Luna |
| OpenCode | None. The button is disabled with "Choose a commit model in settings" until one is set |

If the saved model is no longer in the provider's model list, the call fails with an error. It does not switch to another model.

These calls must not leave sessions in the provider's history. Claude already turns off persistence for them. Codex and OpenCode need a temporary thread or a delete afterwards.

Pull requests use `gh pr create --fill` and involve no AI, so they are unchanged.

### Notifications

When the provider sends a notification itself, offsite uses its text. Claude does this with its `PushNotification` tool, which offsite already catches.

Otherwise the notification names the provider:

- "Codex finished" or "OpenCode finished", with the last assistant reply as the body. The Codex CLI's own `notify` setting does the same.
- "Claude needs your input", "Codex needs your input", or "OpenCode needs your input" for approvals and questions.

### Running the providers

**Claude.** Unchanged. One Agent SDK `query()` per session, stopped after 10 minutes idle.

**Codex.** One `codex app-server` per account, talking newline-delimited JSON-RPC over stdio. It follows t3code's timings (`ProviderSessionManager.ts` in t3code):

- It starts the first time it's needed, including for listing sessions.
- Each thread is unloaded with `thread/unsubscribe` after 30 minutes without use.
- The app-server stops after 30 minutes idle. The stop waits while background work runs, for at most 4 hours.
- The next use starts a new app-server and calls `thread/resume`.
- When offsite exits, the app-server's stdin closes and it exits too.

Sessions started in the Codex CLI do not reach offsite's app-server as events. Offsite watches `~/.codex/sessions`, as it already watches Claude's folder, and calls `thread/list` again when something changes.

**OpenCode.** OpenCode 2.x has one shared background service per machine. `opencode serve --service` writes its address and password to a registration file in OpenCode's state folder. Offsite uses the default from OpenCode's client library, `@opencode/client/service`:

- `ensure()` connects to the running service, or starts one with `opencode serve --service`.
- Offsite never stops the service. It belongs to the machine.
- Requests use HTTP Basic auth with the password from the registration file.
- Events arrive on one stream, `GET /api/event`. It is the only signal that a turn ended, and events missed while it is down are lost. After a reconnect, offsite checks `GET /api/session/active` and reloads messages to catch up, as t3code does.

t3code does not use this service. It starts a private server on a random port and tracks it in files so it can kill it after a crash. Offsite does not need any of that.

## Multi-device

Each machine runs its own offsite server. The server owns that machine's projects, accounts, providers, terminals, and files, as it does today.

A browser keeps a list of machine addresses and connects to each one directly, with one WebSocket per machine. The machine whose address the browser opened is always in the list. "Add machine…" sits next to "Add project…" and takes another address. The list lives in the browser, so each device has its own.

The server accepts WebSocket connections from any origin. This is required for a UI loaded from one machine to talk to another. It also means any website open in the browser can connect to a reachable offsite, which is already true today. The README's warning covers it.

### Projects and sessions

- The project picker and Inbox cover every connected machine.
- A project is identified by machine plus folder. The same path can exist on two machines, so the picker shows which machine each project is on.
- The selection and the URL hold machine, folder, and session, so links and reloads open the right machine.
- A session is identified by machine, provider account, and session id. The SQLite `sessions` table, the runs map, activity, and the URL all key on that instead of the Claude session id alone.
- When a machine is unreachable, its projects stay in the list, marked offline.
- Push notifications are unchanged. Each server sends its own.

### Settings

| Where | What |
| --- | --- |
| Browser | Theme, terminal font and look, diff view, the machine list |
| Machine | Projects, accounts, Claude base folder, provider setup, new-session defaults, commit models |

The settings dialog gets a machine switcher for machine settings.

### Versions

The client and server exchange a protocol version on connect. When a machine runs an incompatible offsite, the UI shows that the machine needs an update instead of failing in odd ways.

### Reconnecting

Today a reconnect loses text that was still streaming. The server keeps the current turn's streamed text in memory and sends it with the session snapshot when a client reconnects. Nothing is written to disk.

## Things to verify before building on them

- **Codex account switching.** Log in to two Codex accounts that share one `~/.codex` as described above, and check that both see and can continue the same threads. If this fails, Codex sessions stay on the account they started with and the account switch is disabled for them.
- **OpenCode TUI and the shared service.** Check that the OpenCode TUI uses the same `--service` instance, so offsite and the TUI can work on the same sessions without conflicts. The service's terminal handoff support suggests it does.

## Build order

This is still open. The suggested order is below, and each step is usable on its own.

1. Shared transcript format, with Claude only. Nothing new is visible, but the later steps build on it.
2. Several machines: the machine list in the browser, the merged project picker, display settings moved to the browser, the version check.
3. Codex.
4. OpenCode.

Steps 1 and 2 could swap if multi-device should come first. The cost is that session ids and the transcript would change twice in the multi-machine code.

## Provider reference

These notes come from reading t3code's code at commit `bb4e4e7e` and the published `@opencode/client` and `@opencode/protocol` 2.0.28 packages.

### Codex app-server

The protocol is newline-delimited JSON over stdio, shaped `{id, method, params}` and `{id, result | error}`, with no `"jsonrpc"` field. t3code generates typed schemas from `codex-rs/app-server-protocol` in the `openai/codex` repo.

| Purpose | Methods |
| --- | --- |
| Startup | `initialize`, then the `initialized` notification. A second `initialize` fails, so serialize it |
| Account | `account/read`, `account/rateLimits/read`, `account/rateLimits/updated` |
| Catalog | `model/list` (paged), `skills/list` |
| Sessions | `thread/list` (filters by `cwd`, pages, searches), `thread/read`, `thread/turns/list`, `thread/start`, `thread/resume`, `thread/fork`, `thread/revert`, `thread/unsubscribe`, `thread/compact/start` |
| Turns | `turn/start`, `turn/steer`, `turn/interrupt` |
| Events | `turn/started`, `turn/completed`, `item/started`, `item/completed`, `item/agentMessage/delta`, `item/reasoning/*`, `item/commandExecution/outputDelta`, `thread/tokenUsage/updated`, `error` |
| Requests to answer | `item/commandExecution/requestApproval`, `item/fileChange/requestApproval`, `item/permissions/requestApproval`, `item/tool/requestUserInput`, `mcpServer/elicitation/request` |

Gotchas t3code handles:

- Send `approvalsReviewer` and `summary: "detailed"` on every turn. Otherwise a resume keeps the old reviewer, and some models default to no reasoning summary.
- Codex's `acceptForSession` only covers the exact command.
- Pending approvals die with the process.
- `thread/revert` needs Codex 0.156 or later.

### OpenCode 2.x

OpenCode 2.x is published as `@opencode/cli`. Its HTTP API lives under `/api/*`.

| Purpose | Endpoints |
| --- | --- |
| Server | `GET /api/info` returns JSON. Use it as the readiness check, because `/health` returns HTML |
| Catalog | `GET /api/model`, `/api/provider`, `/api/agent`, `/api/command`, `/api/skill` |
| Sessions | `GET /api/session` (filters by `directory`, pages with a cursor, searches, takes `parentID` for subagents), `POST /api/session`, `GET /api/session/:id`, `GET /api/session/active` |
| History | `GET /api/session/:id/message`. Send only the cursor on later pages, because a cursor plus `order` is rejected |
| Turns | `POST /api/session/:id/prompt` (with `delivery: "steer"` to steer), `/command`, `/compact`, `/interrupt`, `/model`, `/agent`, `/fork`, `/revert/stage`, `/revert/commit` |
| Requests | `GET /api/session/:id/permission`, `POST …/permission/:id/reply`, `GET …/form`, `POST …/form/:id/reply` |
| Events | `GET /api/event`, an SSE stream with a heartbeat every 10 to 15 seconds |

Gotchas t3code handles:

- Skip unknown event types instead of failing the stream.
- Prompt ids must start with `msg_` and be unique across the server.
- A new directory's command list is empty until `command.updated` arrives.
- A permission reject without a message stops the whole execution.
