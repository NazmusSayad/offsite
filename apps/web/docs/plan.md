# Landing page redesign and docs site

## Goal

Redesign the landing page and add a docs site, both in one Next.js app using Fumadocs.

## Decisions

- Replace the Astro app in `apps/web` with a Next.js app.
- Landing page at `/`, docs at `/docs`, built with Fumadocs.
- Docs are MDX files in the repo, so they can use React components.
- Keep Tailwind 4, the Geist fonts and the images in `public/`.
- Rebuild the landing page from the new designs instead of porting the Astro markup line by line.
- `pnpm web` keeps running the site.
- Host on Vercel with a normal Next.js build, no static export.
- Docs live at `/docs` on the same domain.
- The landing page has light and dark versions and follows the system setting.

## Why Next.js

- Fumadocs fits Next.js best.
- One app for landing and docs: one framework, one deploy, shared styling.
- Since the landing page is being redesigned anyway, the rewrite costs little.
- Tradeoff: every page loads the React runtime, which the Astro page does not.

## Steps

1. Settle the open questions.
2. Set up the Next.js app with Fumadocs in `apps/web`, replacing Astro.
3. Bring over Tailwind, fonts, icons and `public/` images.
4. Build the new landing page from the references.
5. Write the first docs pages.
6. Remove the Astro files and dependencies.

## References

Saved in `references/`.

| File                                                              | Source                                                          | What it shows                                      |
| ----------------------------------------------------------------- | --------------------------------------------------------------- | -------------------------------------------------- |
| `AmenaiSabuwala_2120171692467339741_1.jpg`                        | [post](https://x.com/AmenaiSabuwala/status/2120171692467339741) | Recent landing page design                         |
| `AmenaiSabuwala_2118802347816362396_1.jpg` to `_4.jpg`            | [post](https://x.com/AmenaiSabuwala/status/2118802347816362396) | Landing page on desktop and mobile                 |
| `AmenaiSabuwala_2118610832540209417_1_before.jpg`, `_2_after.jpg` | [post](https://x.com/AmenaiSabuwala/status/2118610832540209417) | Hero before and after a revamp                     |
| `AshikArtistry_2118550257470517317_1.jpg`                         | [post](https://x.com/AshikArtistry/status/2118550257470517317)  | Landing page for a marketing company               |
| `pankajstwt_2120428545021472768_00001.mp4`                        | [post](https://x.com/pankajstwt/status/2120428705361326185)     | Animated workflows section                         |
| `pankajstwt_2120064130543718401_00002.mp4`                        | Picked up with the post above                                   | Second video from the same thread or a linked post |
