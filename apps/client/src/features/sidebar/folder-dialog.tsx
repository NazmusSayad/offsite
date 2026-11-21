import {
  ArrowUp02Icon,
  Cancel01Icon,
  Folder01Icon,
  FolderAddIcon,
  GithubIcon,
  Home07Icon,
  Search01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { DirectoryListing } from '@offsite/core/projects'
import { useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { call } from '@/api/connection'
import { addProject } from '@/api/projects'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog'
import { GitHubDialog } from '@/features/sidebar/github-dialog'
import {
  type Machine,
  type MachineProject,
  machineOf,
  useStore,
} from '@/lib/store'
import { errorMessage } from '@/lib/utils'

export function FolderDialog(props: {
  machine: string
  onClose: () => void
  onAdd: (project: MachineProject) => void
}) {
  const machines = useStore((state) => state.machines)
  const online = useStore(
    (state) => machineOf(state, props.machine).status === 'online'
  )
  const [loaded, setLoaded] = useState<{
    path: string
    listing: DirectoryListing
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [path, setPath] = useState(() =>
    workingDir(machines.find((item) => item.id === props.machine))
  )
  const [search, setSearch] = useState('')
  const [adding, setAdding] = useState(false)
  const [naming, setNaming] = useState(false)
  const [cloning, setCloning] = useState(false)
  const [folderName, setFolderName] = useState('')
  const folderInput = useRef<HTMLInputElement>(null)
  const listing = path.trim() === '' ? undefined : loaded?.listing
  const directories = listing?.directories.filter((directory) =>
    directory.name.toLowerCase().includes(search.toLowerCase())
  )

  function open(next: string) {
    setPath(next)
    setSearch('')
  }

  async function createFolder() {
    if (loaded === null || loaded.path !== path) {
      return
    }
    try {
      const created = await call(props.machine, 'directories.create', {
        parent: loaded.listing.path,
        name: folderName,
      })
      setNaming(false)
      open(created)
    } catch (failure) {
      setError(errorMessage(failure))
    }
  }

  useEffect(() => {
    if (path.trim() === '') {
      return
    }
    let cancelled = false
    const timer = setTimeout(async () => {
      try {
        const next = await call(props.machine, 'directories.list', { path })
        if (cancelled) {
          return
        }
        setLoaded({ path, listing: next })
        setError(null)
      } catch (failure) {
        if (cancelled) {
          return
        }
        setLoaded(null)
        setError(errorMessage(failure))
      }
    }, 150)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [props.machine, path, online])

  return (
    <Dialog open onOpenChange={() => props.onClose()}>
      <DialogContent
        className="gap-0 overflow-hidden p-0 sm:max-w-lg"
        showCloseButton={false}
        aria-describedby={undefined}
        onEscapeKeyDown={(event) => {
          if (naming) {
            event.preventDefault()
            setNaming(false)
            setError(null)
          }
        }}
      >
        <DialogTitle className="sr-only">Add project</DialogTitle>
        <div className="flex items-center gap-1 border-b p-1">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Home folder"
            onClick={() => open('~')}
          >
            <HugeiconsIcon icon={Home07Icon} />
          </Button>
          <div className="bg-border mx-0.5 h-4 w-px" />
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Parent folder"
            disabled={listing?.parent === undefined || listing.parent === null}
            onClick={() => {
              if (listing?.parent !== undefined && listing.parent !== null) {
                open(listing.parent)
              }
            }}
          >
            <HugeiconsIcon icon={ArrowUp02Icon} />
          </Button>
          <input
            aria-label="Folder path"
            className="hover:bg-muted focus:bg-muted h-7 min-w-0 flex-1 rounded-md bg-transparent px-1.5 font-mono text-xs outline-none"
            spellCheck={false}
            value={path}
            onChange={(event) => open(event.target.value)}
          />
          <DialogClose asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Close">
              <HugeiconsIcon icon={Cancel01Icon} />
            </Button>
          </DialogClose>
        </div>
        <div className="flex h-9 items-center gap-2 border-b pr-1 pl-3">
          {naming ? (
            <label className="flex min-w-0 flex-1 items-center gap-2.5">
              <HugeiconsIcon
                icon={FolderAddIcon}
                className="text-muted-foreground size-4 flex-none"
              />
              <input
                ref={folderInput}
                className="placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent text-sm outline-none"
                spellCheck={false}
                placeholder="New folder name"
                value={folderName}
                onChange={(event) => {
                  setFolderName(event.target.value)
                  setError(null)
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    void createFolder()
                  }
                }}
              />
            </label>
          ) : (
            <label className="flex min-w-0 flex-1 items-center gap-2.5">
              <HugeiconsIcon
                icon={Search01Icon}
                className="text-muted-foreground size-4 flex-none"
              />
              <input
                className="placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent text-sm outline-none"
                placeholder="Search this folder"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={naming ? 'Cancel new folder' : 'New folder'}
            disabled={loaded?.path !== path}
            onClick={() => {
              if (naming) {
                setNaming(false)
                setError(null)
                return
              }
              flushSync(() => {
                setNaming(true)
                setFolderName('')
              })
              folderInput.current?.focus()
            }}
          >
            <HugeiconsIcon icon={naming ? Cancel01Icon : FolderAddIcon} />
          </Button>
        </div>
        <div className="h-72 overflow-y-auto p-1">
          {directories?.map((directory) => (
            <button
              key={directory.path}
              className="hover:bg-muted flex h-9 w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 text-left text-sm transition-colors"
              onClick={() => open(directory.path)}
            >
              <HugeiconsIcon
                icon={Folder01Icon}
                className="text-muted-foreground size-4 flex-none"
              />
              <span className="truncate">{directory.name}</span>
            </button>
          ))}
          {directories?.length === 0 && (
            <p className="text-muted-foreground grid h-full place-items-center text-sm">
              {search === '' ? 'No folders here' : 'No matching folders'}
            </p>
          )}
        </div>
        {error !== null && path.trim() !== '' && (
          <p className="text-destructive border-t px-3 py-2 text-sm break-all">
            {error}
          </p>
        )}
        <DialogFooter className="border-t p-3">
          <Button
            variant="outline"
            className="sm:mr-auto"
            disabled={loaded?.path !== path || adding}
            onClick={() => setCloning(true)}
          >
            <HugeiconsIcon icon={GithubIcon} />
            From GitHub
          </Button>
          <Button
            disabled={loaded?.path !== path || adding}
            onClick={async () => {
              if (loaded === null || loaded.path !== path) {
                return
              }
              setAdding(true)
              try {
                props.onAdd({
                  ...(await addProject(props.machine, loaded.listing.path)),
                  machine: props.machine,
                })
              } catch (failure) {
                setError(errorMessage(failure))
                setAdding(false)
              }
            }}
          >
            Add project
          </Button>
        </DialogFooter>
        <Dialog open={cloning} onOpenChange={setCloning}>
          <DialogContent
            className="gap-0 overflow-hidden p-0 sm:max-w-lg"
            showCloseButton={false}
            aria-describedby={undefined}
          >
            {loaded !== null && (
              <GitHubDialog
                machine={props.machine}
                folder={loaded.listing.path}
                onClone={props.onAdd}
              />
            )}
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  )
}

function workingDir(machine: Machine | undefined) {
  if (
    machine === undefined ||
    machine.config === null ||
    machine.system === null
  ) {
    return '~'
  }
  return machine.config.workingDir[machine.system.platform] ?? '~'
}
