import {
  ArrowUp02Icon,
  Cancel01Icon,
  Folder01Icon,
  Home07Icon,
  Search01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { getState, send } from '@/session'
import { focusTerminal } from '@/shortcuts'

export function RenameDialog(props: {
  target: 'tab' | 'group'
  id: number
  name: string
  onDone: () => void
}) {
  const [name, setName] = useState(props.name)

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) props.onDone()
      }}
    >
      <DialogContent
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          focusTerminal()
        }}
      >
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            const trimmed = name.trim()
            if (props.target === 'tab')
              send({ type: 'renameTab', id: props.id, name: trimmed })
            if (props.target === 'group' && trimmed)
              send({ type: 'renameGroup', id: props.id, name: trimmed })
            props.onDone()
          }}
        >
          <DialogHeader>
            <DialogTitle>Rename {props.target}</DialogTitle>
          </DialogHeader>
          <Input
            aria-label="Name"
            placeholder={
              props.target === 'tab' ? 'Use terminal title' : undefined
            }
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={props.onDone}>
              Cancel
            </Button>
            <Button type="submit">Rename</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

type Listing = {
  path: string
  parent: string | null
  directories: { name: string; path: string }[]
}

async function listDirectories(path: string) {
  const response = await fetch(
    `/api/directories?path=${encodeURIComponent(path)}`
  )
  if (!response.ok) throw new Error(await response.text())
  return (await response.json()) as Listing
}

export function FolderDialog(props: {
  groupId: number
  directory: string | null
  onDone: () => void
}) {
  const [loaded, setLoaded] = useState<{
    path: string
    listing: Listing
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [path, setPath] = useState(() => {
    const { config, platform } = getState()
    return [props.directory, config.shell[platform].cwd].find(Boolean) ?? '~'
  })
  const [search, setSearch] = useState('')
  const listing = path.trim() === '' ? undefined : loaded?.listing
  const directories = listing?.directories.filter((directory) =>
    directory.name.toLowerCase().includes(search.toLowerCase())
  )

  function open(path: string) {
    setPath(path)
    setSearch('')
  }

  useEffect(() => {
    if (path.trim() === '') return
    let cancelled = false
    const timer = setTimeout(() => {
      listDirectories(path).then(
        (next) => {
          if (cancelled) return
          setLoaded({ path, listing: next })
          setError(null)
        },
        (failure: unknown) => {
          if (cancelled) return
          setLoaded(null)
          setError(failure instanceof Error ? failure.message : String(failure))
        }
      )
    }, 150)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [path])

  function choose(directory: string) {
    send({ type: 'setDirectory', id: props.groupId, directory })
    props.onDone()
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) props.onDone()
      }}
    >
      <DialogContent
        className="gap-0 overflow-hidden p-0 sm:max-w-lg"
        showCloseButton={false}
        aria-describedby={undefined}
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          focusTerminal()
        }}
      >
        <DialogTitle className="sr-only">Group folder</DialogTitle>
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
            disabled={!listing?.parent}
            onClick={() => {
              if (listing?.parent) open(listing.parent)
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
        <label className="flex h-9 items-center gap-2.5 border-b px-3">
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
        <div className="h-72 overflow-y-auto p-1">
          {directories?.map((directory) => (
            <button
              key={directory.path}
              className="hover:bg-muted flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-sm transition-colors"
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
        {error && path.trim() !== '' && (
          <p className="text-destructive border-t px-3 py-2 text-sm break-all">
            {error}
          </p>
        )}
        <DialogFooter className="border-t p-3">
          {props.directory !== null && (
            <Button
              variant="ghost"
              className="sm:mr-auto"
              onClick={() => choose('')}
            >
              Clear
            </Button>
          )}
          <Button
            disabled={loaded?.path !== path}
            onClick={() => {
              if (loaded?.path === path) choose(loaded.listing.path)
            }}
          >
            Use this folder
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
