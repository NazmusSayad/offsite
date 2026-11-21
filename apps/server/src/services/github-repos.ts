import { existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { GitHubRepo } from '@offsite/core/project-setup'
import { addProject } from './projects.ts'
import { gh } from './pull-requests.ts'

export async function githubRepos(query: string): Promise<GitHubRepo[]> {
  const text = query.trim()
  if (text === '') {
    const output = await gh(os.homedir(), [
      'api',
      'user/repos?per_page=100&sort=pushed&affiliation=owner,collaborator,organization_member',
    ])
    return (
      JSON.parse(output) as {
        full_name: string
        description: string | null
        private: boolean
      }[]
    ).map((repo) => ({
      name: repo.full_name,
      description: repo.description,
      private: repo.private,
    }))
  }
  const output = await gh(os.homedir(), [
    'search',
    'repos',
    '--limit',
    '30',
    '--json',
    'fullName,description,isPrivate',
    '--',
    text,
  ])
  return (
    JSON.parse(output) as {
      fullName: string
      description: string
      isPrivate: boolean
    }[]
  ).map((repo) => ({
    name: repo.fullName,
    description: repo.description === '' ? null : repo.description,
    private: repo.isPrivate,
  }))
}

export async function cloneRepo(repo: string, parent: string) {
  const name = repo.split('/').at(-1)
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo) || name === undefined) {
    throw new Error(`${repo} is not a GitHub repository name`)
  }
  const folder = path.join(path.resolve(parent), name)
  if (existsSync(folder)) {
    throw new Error(`${folder} already exists`)
  }
  await gh(path.dirname(folder), ['repo', 'clone', repo, name])
  return addProject(folder)
}
