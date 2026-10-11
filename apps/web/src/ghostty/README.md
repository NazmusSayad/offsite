# Ghostty terminal

This folder is the web app's terminal. It follows [T3 Code](https://github.com/pingdotgg/t3code)'s web terminal (`apps/web/src/terminal/ghostty/`): [libghostty-vt](https://github.com/ghostty-org/ghostty) compiled to WebAssembly handles the terminal emulation, and our own code draws on a canvas and reads input.

T3 Code is the reference. When their terminal gets a fix, we port it here instead of finding every edge case ourselves.

## Synced versions

| Source            | Version                                                                                                                                                                                 |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T3 Code           | [`4f63275ac7885281d245022e65f1e9e8816b1382`](https://github.com/pingdotgg/t3code/tree/4f63275ac7885281d245022e65f1e9e8816b1382/apps/web/src/terminal/ghostty) (2026-10-10)              |
| Ghostty           | [`9f62873bf195e4d8a762d768a1405a5f2f7b1697`](https://github.com/ghostty-org/ghostty/tree/9f62873bf195e4d8a762d768a1405a5f2f7b1697), the pin in T3 Code's `native/libghostty-vt/VERSION` |
| `ghostty-vt.wasm` | Same file as T3 Code's `apps/web/src/terminal/ghostty/vendor/ghostty-vt.wasm`. SHA-256 `51b016a6aa3c29ead71c7c8acf8c01d43b064bae19957a9c9f9e2bf469267629`                               |

Update this table after every sync.

## Files

| Our file              | T3 Code file                   | Notes                                                                                                                                      |
| --------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `ghostty-vt.wasm`     | `vendor/ghostty-vt.wasm`       | Copied as is                                                                                                                               |
| `ghostty-LICENSE.txt` | `native/libghostty-vt/LICENSE` | Copied as is                                                                                                                               |
| `keys.ts`             | `keyCodes.ts`                  | Mostly the same                                                                                                                            |
| `runtime.ts`          | `runtime.ts`                   | Rewritten. We build the callback module in JS instead of their `ghostty-write-pty.wasm`, and also answer device attribute and size queries |
| `core.ts`             | `core.ts`                      | Rewritten. Adds image anchors and the size report                                                                                          |
| `renderer.ts`         | `renderer.ts`                  | Rewritten. Adds find highlights, the ligature setting and drawn box characters                                                             |
| `terminal.ts`         | `surface.ts`                   | Rewritten for sshtty. Adds images, OSC 52, OSC 9;4 progress, find, OSC 8 links and mobile input                                            |
| `glyphs.ts`           | none                           | Ours. Box, block and shade characters drawn as shapes                                                                                      |
| `images.ts`           | none                           | Ours. Sixel and iTerm2 image decoding                                                                                                      |
| `output.ts`           | none                           | Ours. Finds OSC and sixel sequences in program output                                                                                      |

## How to sync with T3 Code

1. Get T3 Code and look at what changed since our synced commit:

   ```sh
   git clone https://github.com/pingdotgg/t3code.git
   cd t3code
   git log --oneline 4f63275ac..origin/main -- apps/web/src/terminal/ghostty native/libghostty-vt apps/web/scripts/build-libghostty-wasm.sh
   git diff 4f63275ac..origin/main -- apps/web/src/terminal/ghostty native/libghostty-vt apps/web/scripts/build-libghostty-wasm.sh
   ```

2. For each change, use the table above to find our matching file and port the change. Their tests (`*.test.ts`) show the behavior they expect, so read them too.
3. If `native/libghostty-vt/VERSION` changed, copy `apps/web/src/terminal/ghostty/vendor/ghostty-vt.wasm` and `native/libghostty-vt/LICENSE` here, then do the checks in the next section.
4. Update the "Synced versions" table.
5. Test by hand: the items in "What to test after a sync".

## When the WASM file changes

Struct layouts are read from the WASM file at startup (`ghostty_type_json`), so they follow a new version by themselves. These numbers are written by hand, so compare them with the C headers in Ghostty's `include/ghostty/vt/` at the new version:

- Terminal option numbers: `OPTION` in `runtime.ts`, and the `ghostty_terminal_set` calls in `core.ts` (`terminal.h`, `GhosttyTerminalOption`).
- Callback signatures in `CALLBACKS_WASM` in `runtime.ts`: write PTY is `(i32, i32, i32, i32) -> void`, device attributes and size are `(i32, i32, i32) -> i32` (`terminal.h`).
- Enum values used in `core.ts` and `keys.ts`, such as cell and style data keys, cursor styles, modes, key codes and mouse buttons.

Ghostty says that the libghostty-vt API is not stable yet, so expect changes here.

## Building the WASM file from Ghostty

Use this only if we need a Ghostty version that T3 Code has not taken yet. It needs Zig 0.15.2, the same as T3 Code's `apps/web/scripts/build-libghostty-wasm.sh`:

```sh
git clone https://github.com/ghostty-org/ghostty.git
cd ghostty
git checkout <revision>
zig build -Demit-lib-vt -Dtarget=wasm32-freestanding -Doptimize=ReleaseSmall -Dstrip=true -Dlib-version-string="0.1.0-dev+<revision>" -p out
```

Copy `out/bin/ghostty-vt.wasm` here.

## What to test after a sync

- Shell: typing, colors, wide characters and emoji, scrollback, wheel and scroll bar, selection, copy and paste.
- Program replies: `printf '\e[c'` (device attributes) and `printf '\e[14t'` (size) get an answer.
- Titles, OSC 9;4 progress, OSC 52 copy, URL and OSC 8 links, find.
- Sixel and iTerm2 images, and image paste in Claude Code and opencode.
- Theme, font, cursor and ligature settings.
- Reconnect and replay, mobile keys and the Ctrl toggle.
