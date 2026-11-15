import {
  ArrowDown01Icon,
  CircleDashedIcon,
  CloudIcon,
  Folder01Icon,
  SearchIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { GitRepo, WorktreeBases, WorktreeStage } from '@offsite/core/git'
import {
  BranchIcon,
  NewBranchIcon,
  NewWorktreeIcon,
} from '@offsite/core/icons/git'
import {
  AnimatePresence,
  LayoutGroup,
  MotionConfig,
  motion,
} from 'motion/react'
import { RadioGroup } from 'radix-ui'
import { useEffect, useId, useRef, useState } from 'react'
import { call } from '@/api/connection'
import { updateProject } from '@/api/projects'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { logger } from '@/lib/log'
import { getState, showError, type State, update, useStore } from '@/lib/store'
import { cn, errorMessage, touch } from '@/lib/utils'
import { LocationMenu } from './location-menu'
import { keepFocusOnTouch, refocusComposer } from './picker'
import { RepoStatus } from './repo-status'

const log = logger.withTag('worktree')

const spring = { type: 'spring', bounce: 0.15, duration: 0.35 } as const

export function WorktreeBar(props: {
  machine: string
  projectId: string
  worktreeId: string | null
  repos: GitRepo[]
  onRefresh: () => void
}) {
  const worktree = useStore((state) => state.worktree)
  const stage = useStore((state) => state.worktreeStage)
  const remembered = useRef<NonNullable<State['worktree']>>({
    name: '',
    base: null,
  })
  const placeGroup = useId()
  const repo = props.repos.find((item) => item.path === '')
  const [defaultBase, setDefaultBase] = useState<string | null>(null)
  const hasRepo = repo !== undefined

  useEffect(() => {
    if (!hasRepo) {
      return
    }
    let current = true
    async function load() {
      try {
        const found = await call(props.machine, 'projects.bases', {
          projectId: props.projectId,
          query: '',
        })
        if (current) {
          setDefaultBase(found.defaultBase)
        }
      } catch (error) {
        log.error('could not load the default branch', error)
      }
    }
    void load()
    return () => {
      current = false
    }
  }, [props.machine, props.projectId, hasRepo])

  if (repo === undefined) {
    return null
  }

  return (
    <div
      className="absolute inset-x-0 top-full"
      onMouseDown={(event) => {
        if (!(event.target instanceof Element)) {
          return
        }
        if (touch.matches && event.target.closest('input') === null) {
          event.preventDefault()
        }
      }}
    >
      <div className="composer-glass @container relative mx-auto -mt-[calc(1rem+1px)] w-[calc(100%-2.75rem)] rounded-b-2xl border border-t-0 border-(--composer-outline) px-1 pt-[calc(1rem+1px+0.25rem)] pb-1 text-xs/4">
        <div className="flex h-5.5 items-center gap-1.5">
          {stage !== null && (
            <span className="text-muted-foreground flex min-w-0 items-center gap-1.5 px-2 text-[0.6875rem]">
              <HugeiconsIcon
                icon={CircleDashedIcon}
                className="size-3 shrink-0 animate-spin"
              />
              <span className="truncate">{stageText(stage)}</span>
            </span>
          )}
          {stage === null && (
            <MotionConfig reducedMotion="user">
              <LayoutGroup id={placeGroup}>
                <RadioGroup.Root
                  aria-label="Where the agent works"
                  orientation="horizontal"
                  value={worktree === null ? 'checkout' : 'worktree'}
                  className="bg-foreground/5 flex h-5.5 shrink-0 items-center gap-0.5 rounded-[7px] p-0.5 shadow-[inset_0_1px_1px_rgb(0_0_0/0.04)]"
                  onMouseDown={(event) => event.preventDefault()}
                  onValueChange={(value) => {
                    if (value === 'checkout') {
                      if (worktree !== null) {
                        remembered.current = worktree
                      }
                      update({ worktree: null })
                      updateProject(props.machine, props.projectId, {
                        startInWorktree: false,
                      }).catch(showError)
                      return
                    }
                    if (value === 'worktree') {
                      update({ worktree: remembered.current })
                      updateProject(props.machine, props.projectId, {
                        startInWorktree: true,
                      }).catch(showError)
                      return
                    }
                    throw new Error(`${value} is not a place to work`)
                  }}
                >
                  <RadioGroup.Item
                    value="checkout"
                    title="Work in this checkout"
                    aria-label="Checkout"
                    className="text-muted-foreground hover:text-foreground data-[state=checked]:text-foreground focus-visible:ring-ring/40 relative flex h-4.5 shrink-0 cursor-pointer items-center gap-1 rounded-[5px] px-1.25 text-[0.6875rem] whitespace-nowrap transition-colors duration-150 outline-none focus-visible:ring-2"
                  >
                    {worktree === null && (
                      <motion.span
                        layoutId="place"
                        layoutDependency={worktree === null}
                        transition={spring}
                        style={{ borderRadius: 5 }}
                        className="bg-background absolute inset-0 shadow-[0_1px_2px_rgb(0_0_0/0.08),0_0_0_0.5px_rgb(0_0_0/0.06)] dark:bg-white/12"
                      />
                    )}
                    <HugeiconsIcon
                      icon={Folder01Icon}
                      className="relative size-3 shrink-0"
                    />
                    <span className="relative">Checkout</span>
                  </RadioGroup.Item>
                  <RadioGroup.Item
                    value="worktree"
                    title="Work in a new worktree"
                    aria-label="Worktree"
                    className="text-muted-foreground hover:text-foreground data-[state=checked]:text-foreground focus-visible:ring-ring/40 relative flex h-4.5 shrink-0 cursor-pointer items-center gap-1 rounded-[5px] px-1.25 text-[0.6875rem] whitespace-nowrap transition-colors duration-150 outline-none focus-visible:ring-2"
                  >
                    {worktree !== null && (
                      <motion.span
                        layoutId="place"
                        layoutDependency={worktree === null}
                        transition={spring}
                        style={{ borderRadius: 5 }}
                        className="bg-background absolute inset-0 shadow-[0_1px_2px_rgb(0_0_0/0.08),0_0_0_0.5px_rgb(0_0_0/0.06)] dark:bg-white/12"
                      />
                    )}
                    <HugeiconsIcon
                      icon={NewWorktreeIcon}
                      className="relative size-3 shrink-0"
                    />
                    <span className="relative">Worktree</span>
                  </RadioGroup.Item>
                </RadioGroup.Root>
              </LayoutGroup>
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={worktree === null ? 'local' : 'worktree'}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.12 }}
                  className={cn(
                    'flex flex-1 items-center gap-1',
                    worktree !== null && 'min-w-0 @max-sm:justify-end'
                  )}
                >
                  {worktree === null && (
                    <>
                      <DropdownMenu modal={!touch.matches}>
                        <DropdownMenuTrigger asChild>
                          <button
                            className="text-foreground/90 hover:bg-accent data-[state=open]:bg-accent focus-visible:ring-ring/40 flex h-6 max-w-48 min-w-0 cursor-pointer items-center gap-1.5 rounded-md px-2 outline-none focus-visible:ring-2"
                            title="Switch this checkout's branch or open a worktree"
                          >
                            <HugeiconsIcon
                              icon={BranchIcon}
                              className="text-muted-foreground size-3.5 shrink-0"
                            />
                            <span className="truncate">
                              {repo.branch ?? 'Detached HEAD'}
                            </span>
                            <HugeiconsIcon
                              icon={ArrowDown01Icon}
                              className="text-muted-foreground size-3.5 shrink-0"
                            />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align="start"
                          className="w-80"
                          onOpenAutoFocus={keepFocusOnTouch}
                          onCloseAutoFocus={refocusComposer}
                        >
                          <LocationMenu
                            machine={props.machine}
                            projectId={props.projectId}
                            worktreeId={props.worktreeId}
                            onRefresh={props.onRefresh}
                          />
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <RepoStatus
                        repo={repo}
                        target={{
                          machine: props.machine,
                          projectId: props.projectId,
                          worktreeId: props.worktreeId,
                          onRefresh: props.onRefresh,
                        }}
                      />
                    </>
                  )}
                  {worktree !== null && (
                    <>
                      <DropdownMenu modal={!touch.matches}>
                        <DropdownMenuTrigger asChild>
                          <button
                            className="hover:bg-accent data-[state=open]:bg-accent focus-visible:ring-ring/30 flex h-6 max-w-48 min-w-0 shrink cursor-pointer items-center gap-1 rounded-md px-2 outline-none focus-visible:ring-2"
                            title="Choose the branch the worktree starts from"
                          >
                            <span className="text-muted-foreground shrink-0 text-[0.6875rem]">
                              from
                            </span>
                            <span className="truncate">
                              {worktree.base !== null &&
                                shortRef(worktree.base)}
                              {worktree.base === null &&
                                defaultBase !== null &&
                                shortRef(defaultBase)}
                            </span>
                            <HugeiconsIcon
                              icon={ArrowDown01Icon}
                              className="text-muted-foreground size-3.5 shrink-0"
                            />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align="start"
                          className="flex w-72 flex-col overflow-hidden p-0"
                          onOpenAutoFocus={keepFocusOnTouch}
                          onCloseAutoFocus={refocusComposer}
                        >
                          <BaseMenu
                            machine={props.machine}
                            projectId={props.projectId}
                          />
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <div className="@max-sm:composer-glass contents @max-sm:absolute @max-sm:inset-x-[2.75rem] @max-sm:top-[calc(100%+1px)] @max-sm:block @max-sm:rounded-b-xl @max-sm:border @max-sm:border-t-0 @max-sm:border-(--composer-outline) @max-sm:p-0.5">
                        <label className="focus-within:bg-accent/60 hover:bg-accent/40 flex h-6 min-w-0 flex-1 cursor-text items-center gap-1.5 rounded-md px-2 @max-sm:h-5 @max-sm:rounded-b-[0.625rem]">
                          <HugeiconsIcon
                            icon={NewBranchIcon}
                            className="text-muted-foreground size-3.5 shrink-0 @max-sm:hidden"
                          />
                          <input
                            value={worktree.name}
                            placeholder="Branch name (auto if empty)"
                            aria-label="New branch name"
                            spellCheck={false}
                            className="placeholder:text-muted-foreground/70 min-w-0 flex-1 bg-transparent text-ellipsis outline-none @max-sm:text-center @max-sm:text-[0.6875rem]"
                            onChange={(event) =>
                              update({
                                worktree: {
                                  ...worktree,
                                  name: event.target.value,
                                },
                              })
                            }
                          />
                        </label>
                      </div>
                    </>
                  )}
                </motion.div>
              </AnimatePresence>
            </MotionConfig>
          )}
        </div>
      </div>
    </div>
  )
}

function BaseMenu(props: { machine: string; projectId: string }) {
  const [query, setQuery] = useState('')
  const [bases, setBases] = useState<WorktreeBases | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!touch.matches) {
      inputRef.current?.focus()
    }
  }, [])

  useEffect(() => {
    let current = true
    const timer = setTimeout(async () => {
      try {
        const found = await call(props.machine, 'projects.bases', {
          projectId: props.projectId,
          query,
        })
        if (current) {
          setBases(found)
          setFailure(null)
        }
      } catch (error) {
        log.error('could not load the branches', error)
        if (current) {
          setFailure(errorMessage(error))
        }
      }
    }, 150)
    return () => {
      current = false
      clearTimeout(timer)
    }
  }, [props.machine, props.projectId, query])

  function pick(ref: string) {
    if (bases === null) {
      return
    }
    const current = getState().worktree
    if (current === null) {
      return
    }
    update({
      worktree: {
        ...current,
        base: ref === bases.defaultBase ? null : ref,
      },
    })
  }

  function item(ref: string, note: string | null) {
    return (
      <DropdownMenuItem
        key={ref}
        data-base
        title={`Start a new branch from the ${ref.startsWith('refs/remotes/') ? 'remote' : 'local'} branch ${shortRef(ref)}`}
        onSelect={() => pick(ref)}
      >
        <HugeiconsIcon
          icon={ref.startsWith('refs/remotes/') ? CloudIcon : BranchIcon}
          className="text-muted-foreground size-3.5 shrink-0"
        />
        <span className="min-w-0 flex-1 truncate">{shortRef(ref)}</span>
        {note !== null && (
          <span className="text-muted-foreground text-xs">{note}</span>
        )}
      </DropdownMenuItem>
    )
  }

  return (
    <div
      className="flex min-h-0 flex-col select-none"
      onKeyDownCapture={(event) => {
        if (
          event.target !== inputRef.current &&
          !event.ctrlKey &&
          !event.metaKey &&
          !event.altKey &&
          ((event.key.length === 1 && event.key !== ' ') ||
            event.key === 'Backspace')
        ) {
          event.stopPropagation()
          inputRef.current?.focus()
        }
      }}
    >
      <div className="border-border flex h-9 shrink-0 items-center gap-2 border-b px-3">
        <HugeiconsIcon
          icon={SearchIcon}
          className="text-muted-foreground size-4 shrink-0"
        />
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              return
            }
            event.stopPropagation()
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              listRef.current
                ?.querySelector<HTMLElement>(
                  '[role^=menuitem]:not([data-disabled])'
                )
                ?.focus()
            }
            if (event.key === 'Enter') {
              event.preventDefault()
              listRef.current
                ?.querySelector<HTMLElement>('[data-base]')
                ?.click()
            }
          }}
          placeholder="Search branches"
          aria-label="Search branches"
          className="placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent text-sm outline-none"
        />
      </div>
      <div ref={listRef} className="max-h-80 min-h-0 overflow-y-auto p-1">
        {failure !== null && (
          <div className="text-destructive px-2 py-6 text-center text-sm wrap-anywhere">
            {failure}
          </div>
        )}
        {failure === null && bases === null && (
          <DropdownMenuItem disabled>Loading…</DropdownMenuItem>
        )}
        {bases !== null && (
          <>
            {query.trim() === '' && item(bases.defaultBase, 'Default')}
            {bases.local.length > 0 && (
              <DropdownMenuLabel>Local branches</DropdownMenuLabel>
            )}
            {bases.local.map((ref) => item(ref, null))}
            {bases.remote.length > 0 && (
              <DropdownMenuLabel>Remote branches</DropdownMenuLabel>
            )}
            {bases.remote.map((ref) => item(ref, null))}
            {query.trim() !== '' &&
              bases.local.length === 0 &&
              bases.remote.length === 0 && (
                <div className="text-muted-foreground px-2 py-6 text-center text-sm">
                  No matching branches
                </div>
              )}
          </>
        )}
      </div>
    </div>
  )
}

function shortRef(ref: string) {
  if (ref.startsWith('refs/heads/')) {
    return ref.slice('refs/heads/'.length)
  }
  if (ref.startsWith('refs/remotes/')) {
    return ref.slice('refs/remotes/'.length)
  }
  throw new Error(`${ref} is not a branch`)
}

export function stageText(stage: WorktreeStage) {
  switch (stage) {
    case 'fetch':
      return 'Fetching the base branch…'
    case 'name':
      return 'Naming the branch…'
    case 'create':
      return 'Creating the worktree…'
  }
}
