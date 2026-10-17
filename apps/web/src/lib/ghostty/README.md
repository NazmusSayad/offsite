# Ghostty terminal

This folder is the web app's terminal. It follows [T3 Code](https://github.com/pingdotgg/t3code)'s web terminal (`apps/web/src/terminal/ghostty/`): [libghostty-vt](https://github.com/ghostty-org/ghostty) compiled to WebAssembly handles the terminal emulation, and our own code draws on a canvas and reads input.

T3 Code is the reference. When their terminal gets a fix, we port it here instead of finding every edge case ourselves.

## Synced versions

| Source            | Version                                                                                                                                                                                 |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T3 Code           | [`4f63275ac7885281d245022e65f1e9e8816b1382`](https://github.com/pingdotgg/t3code/tree/4f63275ac7885281d245022e65f1e9e8816b1382/apps/web/src/terminal/ghostty) (2026-10-10)              |
| Ghostty           | [`9f62873bf195e4d8a762d768a1405a5f2f7b1697`](https://github.com/ghostty-org/ghostty/tree/9f62873bf195e4d8a762d768a1405a5f2f7b1697), the pin in T3 Code's `native/libghostty-vt/VERSION` |
| `ghostty-vt.wasm` | Built from the Ghostty pin with `kitty-graphics.patch`. SHA-256 `61808079850fe57f470e8a703ca5b4df8783b7825ccb6aed7a90035f87144050`                                                      |

Update this table after every sync.

## Files

| Our file               | T3 Code file                   | Notes                                                                                                                                                                       |
| ---------------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ghostty-vt.wasm`      | `vendor/ghostty-vt.wasm`       | Built by `scripts/build-ghostty-wasm.mts` with kitty graphics turned on                                                                                                     |
| `kitty-graphics.patch` | none                           | Ours. The Ghostty change that turns on kitty graphics in the WASM build                                                                                                     |
| `ghostty-LICENSE.txt`  | `native/libghostty-vt/LICENSE` | Copied as is                                                                                                                                                                |
| `keys.ts`              | `keyCodes.ts`                  | Mostly the same. Also has the key, paste and mouse encoders                                                                                                                 |
| `runtime.ts`           | `runtime.ts`                   | Rewritten. We build the callback module in JS instead of their `ghostty-write-pty.wasm`, and also answer device attribute and size queries                                  |
| `core.ts`              | `core.ts`                      | Rewritten. Adds image anchors and the size report                                                                                                                           |
| `render-state.ts`      | `core.ts`                      | Split from `core.ts`. Reads rows, cells and colors for each frame                                                                                                           |
| `renderer.ts`          | `renderer.ts`                  | Rewritten. Adds find highlights, the ligature setting, drawn box characters and kitty image layers                                                                          |
| `terminal.ts`          | `surface.ts`                   | Rewritten for offsite. Adds images, kitty images, OSC 52, OSC 9;4 progress, find, OSC 8 links and mobile input                                                              |
| `pointer.ts`           | `surface.ts`                   | Split from `terminal.ts`. Mouse reports, selection, links, wheel and the scroll bar                                                                                         |
| `osc.ts`               | none                           | Ours. Clipboard, color, progress and notification sequences                                                                                                                 |
| `find.ts`              | none                           | Ours. Find in the terminal                                                                                                                                                  |
| `prompt.ts`            | none                           | Ours. Prompt marks and click to move the cursor                                                                                                                             |
| `glyphs.ts`            | none                           | Ours. Box, block and shade characters drawn as shapes                                                                                                                       |
| `images.ts`            | none                           | Ours. Sixel, iTerm2 and PNG decoding, and inline image anchors                                                                                                              |
| `kitty.ts`             | none                           | Ours. Kitty image placements and pixels, and a port of Ghostty's `src/terminal/kitty/graphics_unicode.zig`: kitty Unicode placeholders, which Ghostty draws in its renderer |
| `output.ts`            | none                           | Ours. Finds OSC and sixel sequences in program output                                                                                                                       |

## How to sync with T3 Code

1. Get T3 Code and look at what changed since our synced commit:

   ```sh
   git clone https://github.com/pingdotgg/t3code.git
   cd t3code
   git log --oneline 4f63275ac..origin/main -- apps/web/src/terminal/ghostty native/libghostty-vt apps/web/scripts/build-libghostty-wasm.sh
   git diff 4f63275ac..origin/main -- apps/web/src/terminal/ghostty native/libghostty-vt apps/web/scripts/build-libghostty-wasm.sh
   ```

2. For each change, use the table above to find our matching file and port the change. Their tests (`*.test.ts`) show the behavior they expect, so read them too.
3. If `native/libghostty-vt/VERSION` changed, set `revision` in `scripts/build-ghostty-wasm.mts` to the new pin, build the WASM file (see "Building the WASM file"), copy `native/libghostty-vt/LICENSE` here, then do the checks in the next section. Do not copy their `ghostty-vt.wasm`: it has no kitty graphics, and the terminal refuses to start with it.
4. Update the "Synced versions" table.
5. Run `nr test`. The `*.test.ts` files here check the escape sequence replies, underline styles and colors, box characters and background edges. `core.test.ts` and `terminal.test.ts` run the real WASM file, so they also catch changes to the color data keys, the focus mode and the underline values.
6. Test by hand: the items in "What to test after a sync".

## When the WASM file changes

Struct layouts are read from the WASM file at startup (`ghostty_type_json`), so they follow a new version by themselves. These numbers are written by hand, so compare them with the C headers in Ghostty's `include/ghostty/vt/` at the new version:

- Terminal option numbers: `OPTION` in `runtime.ts`, and the `ghostty_terminal_set` calls in `core.ts` (`terminal.h`, `GhosttyTerminalOption`).
- Callback signatures in `CALLBACKS_WASM` in `runtime.ts`: write PTY is `(i32, i32, i32, i32) -> void`, device attributes and size are `(i32, i32, i32) -> i32` (`terminal.h`), and PNG decoding is `(i32, i32, i32, i32, i32) -> i32` (`sys.h`).
- Kitty graphics numbers: `KITTY_*` in `kitty.ts` (`kitty_graphics.h` and the kitty data keys in `terminal.h`), and `SYS_DECODE_PNG` and the `GhosttySysImage` offsets in `SYS_IMAGE` in `runtime.ts` (`sys.h`). `GhosttyKittyGraphicsPlacementRenderInfo` and `GhosttySysImage` are not in `ghostty_type_json`, so their offsets in `KITTY_RENDER_INFO` and `SYS_IMAGE` are written by hand for wasm32.
- Enum values used in `core.ts`, `render-state.ts` and `keys.ts`, such as cell and style data keys, cursor styles, modes, key codes and mouse buttons.
- Terminal data keys for the color replies in `core.ts` and `render-state.ts`: 18 foreground, 19 background, 20 cursor and 21 palette (`terminal.h`, `GhosttyTerminalData`), and mode 1004 for focus events (`modes.h`).
- Underline values 0 to 5 in `renderer.ts` and the style color tags `STYLE_COLOR_PALETTE` and `STYLE_COLOR_RGB` in `render-state.ts` (`style.h`).
- `PAGE_BYTES` and `PAGE_GRID_BYTES` in `core.ts`. At this Ghostty version `max_scrollback` is a byte limit counted in whole pages (`PageList.zig`), although `terminal.h` calls it lines, so `core.ts` turns the scrollback lines setting into pages, capped at 50 MB per terminal like Ghostty's default `scrollback-limit-bytes`. A page is 589,824 bytes in the WASM build and holds `381888 / (8 * (cols + 1))` rows. To check a new WASM file, write lines into terminals of a few widths with `max_scrollback` set to 1 and look at the largest scroll bar total: it should be twice the rows per page. Newer Ghostty versions have `GHOSTTY_TERMINAL_OPT_SCROLLBACK_MAX_LINES`, which can replace this.

Ghostty says that the libghostty-vt API is not stable yet, so expect changes here.

## Building the WASM file

Ghostty turns kitty graphics off in WASM builds because the image storage uses the clock to find the oldest image, and WASM has no clock. `kitty-graphics.patch` turns it on, uses a counter instead of the clock (only the order matters), and refuses file and shared memory images, which WASM cannot read. The rest of the kitty code is Ghostty's.

Build it with:

```sh
node scripts/build-ghostty-wasm.mts
```

It fetches Ghostty at `revision`, applies the patch, builds with Zig 0.15.2 through mise and writes `ghostty-vt.wasm` here. Put the printed SHA-256 in the "Synced versions" table. If the patch no longer applies to a new revision, the script stops: update the patch for the new code and keep it to these changes.

## What to test after a sync

- Shell: typing, colors, wide characters and emoji, scrollback, wheel and scroll bar, selection, copy and paste.
- Program replies: `printf '\e[c'` (device attributes), `printf '\e[14t'` (size), `printf '\e]11;?\a'` and `printf '\e]4;1;?\a'` (theme colors) get an answer.
- Focus events: after `printf '\e[?1004h'`, the terminal sends `\e[I` and `\e[O` when it gets and loses focus.
- Underline styles `\e[4:1m` to `\e[4:5m` and underline colors `\e[58:2::255:0:0m`, box characters (light, heavy, double, rounded) and colored backgrounds without seams at browser zoom 100% and 125%.
- Titles, OSC 9;4 progress, OSC 52 copy, URL and OSC 8 links, find.
- Sixel and iTerm2 images, and image paste in Claude Code and opencode.
- Kitty images: `kitten icat` with a PNG, the same image with `--z-index -1` behind text, and `kitten icat --clear`.
- Kitty Unicode placeholders: image previews in yazi with the Ghostty terminal identity, and `kitten icat --unicode-placeholder` with a PNG.
- Theme, font, cursor and ligature settings.
- Reconnect and replay, mobile keys and the Ctrl toggle.
