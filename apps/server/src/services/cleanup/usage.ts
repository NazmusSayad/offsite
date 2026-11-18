import { runs } from '../../lib/live.ts'
import { db } from '../../storage/db.ts'
import { outbox } from '../../storage/schema.ts'
import { worktrees } from '../project-worktrees.ts'
import { projects } from '../projects.ts'
import { terminalTabs } from '../terminal/terminal.ts'
import { inside, realPath } from './folders.ts'

export function busyReason(
  folder: string,
  own: { projectId: string | null; worktreeIds: string[] }
) {
  if ([...runs.values()].some((run) => inside(realPath(run.cwd), folder))) {
    return 'an agent is running in it'
  }
  if (
    terminalTabs().some((tab) =>
      tab.worktreeId === null
        ? tab.projectId !== null && tab.projectId === own.projectId
        : own.worktreeIds.includes(tab.worktreeId)
    )
  ) {
    return 'a terminal is open in it'
  }
  if (
    db
      .select()
      .from(outbox)
      .all()
      .some((row) =>
        row.worktreeId === null
          ? row.projectId === own.projectId
          : own.worktreeIds.includes(row.worktreeId)
      )
  ) {
    return 'a message waiting to be sent uses it'
  }
  if (
    projects().some(
      (project) =>
        project.id !== own.projectId && inside(realPath(project.path), folder)
    )
  ) {
    return 'a project is inside it'
  }
  if (
    worktrees().some(
      (worktree) =>
        !own.worktreeIds.includes(worktree.id) &&
        inside(realPath(worktree.path), folder)
    )
  ) {
    return 'another worktree is inside it'
  }
  return null
}
