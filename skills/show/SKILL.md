---
name: show
description: Shows images, videos and audio inline in the offsite chat. Use whenever the user should see an image, video or audio file.
---

# Show images, videos and audio in chat

The user reads your replies in offsite, which renders a Markdown image inline when its path points to an existing file:

```markdown
![Alt text](/absolute/path/to/file.png)
![Alt text](C:/absolute/path/to/file.png)
![Alt text](./relative/path/to/file.png)
```

## Rules

- Start the path with `/` for an absolute path, a drive letter like `C:/` for an absolute path on Windows, or `./` for a path relative to the project root. Other paths do not render.
- On Windows, use forward slashes and the real drive letter: `C:/Users/name/file.png`. Do not use backslashes, because Markdown removes the one before characters like `.` and `_`. Do not use `/c/Users/name/file.png`.
- Supported formats: PNG, JPEG, GIF, WebP and SVG images; MP4, WebM and MOV videos; MP3, WAV, OGG, M4A, AAC and FLAC audio. Videos and audio use the same syntax and render as players.
- Never use `file://` URLs. They do not render.
- Wrap a path that contains spaces in angle brackets: `![Alt text](</absolute/path with spaces/file.png>)`.
- Put each file on its own line, with alt text that says what it shows.
