import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared'

export const GITHUB_URL = 'https://github.com/NazmusSayad/offsite'
export const NPM_URL = 'https://www.npmjs.com/package/offsite'

export const baseOptions: BaseLayoutProps = {
  nav: {
    title: (
      <>
        <img src="/icon.svg" alt="" className="size-5" />
        OffSite
      </>
    ),
  },
  githubUrl: GITHUB_URL,
}
