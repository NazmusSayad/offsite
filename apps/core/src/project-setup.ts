import type { Project } from './projects.ts'

export type GitHubRepo = {
  name: string
  description: string | null
  private: boolean
}

export type ProjectSetupMethods = {
  'directories.create': {
    params: { parent: string; name: string }
    result: string
  }
  'github.repos': { params: { query: string }; result: GitHubRepo[] }
  'github.clone': { params: { repo: string; parent: string }; result: Project }
}
