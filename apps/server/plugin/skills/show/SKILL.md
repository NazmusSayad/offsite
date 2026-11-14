---
name: show
description: Visualize images, videos, audio and Mermaid diagrams in the chat. Use when a reply includes a screenshot, image, video, audio file or Mermaid diagram.
---

## Images, videos and audio

Offsite renders a Markdown image inline when its path points to an existing file:

```markdown
![Alt text](./relative/path/to/file.png)
![Alt text](/absolute/path/to/file.png)
![Alt text](C:/absolute/path/to/file.png)
```

- Start the path with `/` for an absolute path, a drive letter like `C:/` for an absolute path on Windows, or `./` for a path relative to the project root. Other paths do not render.
- On Windows, use forward slashes and the real drive letter: `C:/Users/name/file.png`. Do not use backslashes, because Markdown removes the one before characters like `.` and `_`. Do not use `/c/Users/name/file.png`.
- Supported formats: PNG, JPEG, GIF, WebP and SVG images; MP4, WebM and MOV videos; MP3, WAV, OGG, M4A, AAC and FLAC audio. Videos and audio use the same syntax and render as players.
- Never use `file://` URLs. They do not render.
- Wrap a path that contains spaces in angle brackets: `![Alt text](</absolute/path with spaces/file.png>)`.

## Image guidelines

- Write a short label in the message text directly above each file, saying what it shows. Each file needs its own label, even when several files sit under one heading.
- **When you make an image:**
  - For a before and after, put both side by side in one image, zoomed in on the area that is the focus.
  - When it combines several versions, such as before and after or variants, write a label on the image above each version that names exactly what it shows, like "Before", "After" or the variant's name.

## Mermaid diagrams

Offsite renders a fenced code block with the `mermaid` language as a diagram.
