---
name: show-images
description: Shows images inline in the offsite chat. Use whenever the user should see an image file.
---

# Show images in chat

The user reads your replies in offsite, which renders a Markdown image inline when its path points to a file in the project:

```markdown
![Header after the change](/Users/me/project/.screenshots/header.png)
![Header after the change](./.screenshots/header.png)
```

## Rules

- Start the path with `/` for an absolute path, or `./` for a path relative to the project root. Other paths do not render.
- Keep the file inside the project folder. Save screenshots there, not in `/tmp`. Files outside the project show an error instead of the image.
- Keep the file at 1 MB or less. Supported formats: PNG, JPEG, GIF, WebP and SVG.
- Never use `file://` URLs. They do not render.
- Wrap a path that contains spaces in angle brackets: `![Diff](</Users/me/my project/diff.png>)`.
- Put each image on its own line, with alt text that says what the image shows.
