import {
  ArrowUp02Icon,
  Cancel01Icon,
  Delete02Icon,
  Folder01Icon,
  Home07Icon,
  Image01Icon,
  Search01Icon,
  Upload04Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { Directories } from '@offsite/core/protocol'
import { useEffect, useRef, useState } from 'react'
import { call } from '@/api/connection'
import { addProject, removeProject, updateProject } from '@/api/projects'
import { readBase64 } from '@/api/upload'
import { ProjectBadge } from '@/components/icons'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { projectName } from '@/lib/format'
import { type MachineProject, useStore } from '@/lib/store'
import { cn, errorMessage } from '@/lib/utils'

const IMAGE_FILE = /\.(png|jpe?g|gif|webp|svg)$/i

export function FolderDialog(props: {
  machine: string
  onClose: () => void
  onAdd: (project: MachineProject) => void
}) {
  const machines = useStore((state) => state.machines)
  const [machine, setMachine] = useState(props.machine)
  const [loaded, setLoaded] = useState<{
    path: string
    listing: Directories
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [path, setPath] = useState('~')
  const [search, setSearch] = useState('')
  const [adding, setAdding] = useState(false)
  const listing = path.trim() === '' ? undefined : loaded?.listing
  const directories = listing?.directories.filter((directory) =>
    directory.name.toLowerCase().includes(search.toLowerCase())
  )

  function open(next: string) {
    setPath(next)
    setSearch('')
  }

  useEffect(() => {
    if (path.trim() === '') {return}
    let cancelled = false
    const timer = setTimeout(async () => {
      try {
        const next = await call(machine, 'directories.list', { path })
        if (cancelled) {return}
        setLoaded({ path, listing: next })
        setError(null)
      } catch (failure) {
        if (cancelled) {return}
        setLoaded(null)
        setError(errorMessage(failure))
      }
    }, 150)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [machine, path])

  return (
    <Dialog open onOpenChange={() => props.onClose()}>
      <DialogContent
        className="gap-0 overflow-hidden p-0 sm:max-w-lg"
        showCloseButton={false}
        aria-describedby={undefined}
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
              if (listing?.parent !== undefined && listing.parent !== null)
                {open(listing.parent)}
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
          {machines.length > 1 && (
            <Select
              value={machine}
              onValueChange={(next) => {
                setMachine(next)
                setLoaded(null)
                open('~')
              }}
            >
              <SelectTrigger className="sm:mr-auto sm:w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {machines.map((item) => (
                  <SelectItem
                    key={item.id}
                    value={item.id}
                    disabled={item.status !== 'online'}
                  >
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button
            disabled={loaded?.path !== path || adding}
            onClick={async () => {
              if (loaded === null || loaded.path !== path) {return}
              setAdding(true)
              try {
                props.onAdd({
                  ...(await addProject(machine, loaded.listing.path)),
                  machine,
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
      </DialogContent>
    </Dialog>
  )
}

export function EditProjectDialog(props: {
  project: MachineProject
  onClose: () => void
  onRemoved: () => void
}) {
  const path = props.project.path
  const [name, setName] = useState(props.project.name)
  const [logo, setLogo] = useState(props.project.logo)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [picking, setPicking] = useState(false)
  const picker = useRef<HTMLInputElement>(null)

  return (
    <Dialog open onOpenChange={() => props.onClose()}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-md">
        <form
          className="grid"
          onSubmit={async (event) => {
            event.preventDefault()
            setSaving(true)
            try {
              await updateProject(props.project.machine, props.project.id, {
                name,
                logo,
              })
              props.onClose()
            } catch (failure) {
              setError(errorMessage(failure))
              setSaving(false)
            }
          }}
        >
          <DialogHeader className="gap-1 px-6 pt-4 pr-12">
            <DialogTitle className="text-base">Edit project</DialogTitle>
            <DialogDescription
              className="truncate font-mono text-xs"
              title={path}
            >
              {path}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-6 p-6">
            <div className="grid gap-2.5">
              <Label>Icon</Label>
              <div className="flex items-center gap-4">
                <ProjectBadge
                  name={name.trim() === '' ? projectName(path) : name}
                  logo={logo}
                  className="ring-foreground/10 size-16 rounded-2xl ring-1 [&>img]:rounded-2xl [&>svg]:rounded-2xl"
                />
                <div className="grid gap-2">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      title="Upload an image from this device"
                      onClick={() => picker.current?.click()}
                    >
                      <HugeiconsIcon icon={Upload04Icon} />
                      Upload
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      title="Choose an image from the project on the server"
                      onClick={() => setPicking(true)}
                    >
                      <HugeiconsIcon icon={Folder01Icon} />
                      Choose from project
                    </Button>
                    {logo !== null && (
                      <Button
                        type="button"
                        variant="ghost-muted"
                        size="sm"
                        onClick={() => setLogo(null)}
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                  <p className="text-muted-foreground text-xs">
                    PNG, JPG, GIF, WebP, SVG or ICO, up to 384 KB
                  </p>
                </div>
              </div>
              <input
                ref={picker}
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml,image/x-icon"
                hidden
                onChange={async (event) => {
                  const file = event.target.files?.[0]
                  event.target.value = ''
                  if (file === undefined) {return}
                  setLogo(`data:${file.type};base64,${await readBase64(file)}`)
                }}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="project-name">Name</Label>
              <Input
                id="project-name"
                placeholder={projectName(path)}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            {error !== null && (
              <p className="text-destructive text-sm break-all">{error}</p>
            )}
          </div>
          <DialogFooter className="bg-muted/40 border-t px-6 py-4">
            <Button
              type="button"
              variant={confirming ? 'destructive' : 'ghost'}
              className={cn(
                'sm:mr-auto',
                !confirming &&
                  'text-destructive hover:bg-destructive/10 hover:text-destructive'
              )}
              title="Its threads stay in their provider"
              onClick={async () => {
                if (!confirming) {
                  setConfirming(true)
                  return
                }
                try {
                  await removeProject(props.project.machine, props.project.id)
                  props.onRemoved()
                } catch (failure) {
                  setError(errorMessage(failure))
                }
              }}
            >
              <HugeiconsIcon icon={Delete02Icon} className="text-current" />
              {confirming ? 'Click again to remove' : 'Remove project'}
            </Button>
            <Button type="button" variant="outline" onClick={props.onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={name.trim() === '' || saving}>
              Save
            </Button>
          </DialogFooter>
        </form>
        {picking && (
          <IconPickerDialog
            machine={props.project.machine}
            projectId={props.project.id}
            onClose={() => setPicking(false)}
            onPick={(next) => {
              setLogo(next)
              setPicking(false)
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function IconPickerDialog(props: {
  machine: string
  projectId: string
  onClose: () => void
  onPick: (logo: string) => void
}) {
  const [files, setFiles] = useState<string[] | null>(null)
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)
  const images = files?.filter(
    (file) =>
      IMAGE_FILE.test(file) && file.toLowerCase().includes(search.toLowerCase())
  )

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const next = await call(props.machine, 'files.list', {
          projectId: props.projectId,
        })
        if (!cancelled) {setFiles(next)}
      } catch (failure) {
        if (!cancelled) {setError(errorMessage(failure))}
      }
    })()
    return () => {
      cancelled = true
    }
  }, [props.machine, props.projectId])

  return (
    <Dialog open onOpenChange={() => props.onClose()}>
      <DialogContent
        className="gap-0 overflow-hidden p-0 sm:max-w-lg"
        showCloseButton={false}
        aria-describedby={undefined}
      >
        <DialogTitle className="sr-only">Pick icon</DialogTitle>
        <div className="flex items-center gap-1 border-b p-1">
          <label className="flex h-7 min-w-0 flex-1 items-center gap-2.5 px-2">
            <HugeiconsIcon
              icon={Search01Icon}
              className="text-muted-foreground size-4 flex-none"
            />
            <input
              className="placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent text-sm outline-none"
              placeholder="Search images in this project"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <DialogClose asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Close">
              <HugeiconsIcon icon={Cancel01Icon} />
            </Button>
          </DialogClose>
        </div>
        <div className="h-72 overflow-y-auto p-1">
          {images?.map((file) => (
            <button
              key={file}
              className="hover:bg-muted flex h-9 w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 text-left text-sm transition-colors"
              onClick={async () => {
                try {
                  const preview = await call(props.machine, 'files.read', {
                    projectId: props.projectId,
                    path: file,
                  })
                  if (preview.kind === 'image')
                    {props.onPick(
                      `data:${preview.mediaType};base64,${preview.data}`
                    )}
                  else if (preview.kind === 'large')
                    {setError(`${file} is too large`)}
                  else {setError(`${file} is not an image`)}
                } catch (failure) {
                  setError(errorMessage(failure))
                }
              }}
            >
              <HugeiconsIcon
                icon={Image01Icon}
                className="text-muted-foreground size-4 flex-none"
              />
              <span className="truncate font-mono text-xs">{file}</span>
            </button>
          ))}
          {images?.length === 0 && (
            <p className="text-muted-foreground grid h-full place-items-center text-sm">
              {search === ''
                ? 'No images in this project'
                : 'No matching images'}
            </p>
          )}
        </div>
        {error !== null && (
          <p className="text-destructive border-t px-3 py-2 text-sm break-all">
            {error}
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}
