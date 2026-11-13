import {
  ArrowUp02Icon,
  Cancel01Icon,
  Folder01Icon,
  Image01Icon,
  Search01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { byLengthAsc, Fzf, type FzfResultItem } from 'fzf'
import { useEffect, useState } from 'react'
import { call } from '@/api/connection'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  findIconMatches,
  IconMatches,
  type IconMatching,
} from '@/features/sidebar/icon-matches'
import { mediaUrl } from '@/lib/media'
import { errorMessage } from '@/lib/utils'

export function IconPickerDialog(props: {
  machine: string
  projectId: string
  matching: IconMatching | null
  onClose: () => void
  onPick: (logo: string) => void
}) {
  const [files, setFiles] = useState<string[] | null>(null)
  const [matching, setMatching] = useState(props.matching)
  const [search, setSearch] = useState('')
  const [folder, setFolder] = useState('')
  const [error, setError] = useState<string | null>(null)
  const prefix = folder === '' ? '' : `${folder}/`
  const inside = (files ?? [])
    .filter((file) => file.startsWith(prefix))
    .map((file) => file.slice(prefix.length))
  const folders = [
    ...new Set(
      inside
        .filter((rest) => rest.includes('/'))
        .map((rest) => rest.split('/')[0])
    ),
  ].sort((a, b) => a.localeCompare(b))
  const images =
    search === ''
      ? inside
          .filter((rest) => !rest.includes('/'))
          .sort((a, b) => a.localeCompare(b))
          .map((name) => `${prefix}${name}`)
      : new Fzf(files ?? [], {
          limit: 25,
          casing: 'case-insensitive',
          tiebreakers: [
            (a, b) => fileNameMatches(b) - fileNameMatches(a),
            byLengthAsc,
          ],
        })
          .find(search)
          .map((entry) => entry.item)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const next = await call(props.machine, 'projects.logoFiles', {
          id: props.projectId,
        })
        if (!cancelled) {
          setFiles(next)
        }
      } catch (failure) {
        if (!cancelled) {
          setError(errorMessage(failure))
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [props.machine, props.projectId])

  return (
    <Dialog open onOpenChange={() => props.onClose()}>
      <DialogContent
        className="flex h-96 flex-col gap-0 overflow-hidden p-0 sm:max-w-lg"
        showCloseButton={false}
        aria-describedby={undefined}
      >
        {matching !== null ? (
          <IconMatches
            matching={matching}
            machine={props.machine}
            projectId={props.projectId}
            onUse={props.onPick}
            onBack={props.matching === null ? () => setMatching(null) : null}
          />
        ) : (
          <>
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
            {search === '' && (
              <div className="flex items-center gap-1 border-b p-1">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Parent folder"
                  disabled={folder === ''}
                  onClick={() =>
                    setFolder(folder.split('/').slice(0, -1).join('/'))
                  }
                >
                  <HugeiconsIcon icon={ArrowUp02Icon} />
                </Button>
                <span className="truncate px-1.5 font-mono text-xs">
                  /{folder}
                </span>
              </div>
            )}
            <div className="min-h-0 flex-1 overflow-y-auto p-1">
              {search === '' &&
                folders.map((name) => (
                  <button
                    key={name}
                    className="hover:bg-muted flex h-9 w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 text-left text-sm transition-colors"
                    onClick={() => setFolder(`${prefix}${name}`)}
                  >
                    <HugeiconsIcon
                      icon={Folder01Icon}
                      className="text-muted-foreground size-4 flex-none"
                    />
                    <span className="truncate font-mono text-xs">{name}</span>
                  </button>
                ))}
              {images.map((file) => (
                <button
                  key={file}
                  className="hover:bg-muted flex h-9 w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 text-left text-sm transition-colors"
                  onClick={async () => {
                    try {
                      const logo = await call(
                        props.machine,
                        'projects.logoFile',
                        {
                          id: props.projectId,
                          path: file,
                        }
                      )
                      const matches = await findIconMatches(logo, props.machine)
                      if (matches.length === 0) {
                        props.onPick(logo)
                        return
                      }
                      setMatching({ logo, matches })
                    } catch (failure) {
                      setError(errorMessage(failure))
                    }
                  }}
                >
                  <Thumbnail
                    machine={props.machine}
                    projectId={props.projectId}
                    path={file}
                  />
                  <span className="truncate font-mono text-xs">
                    {search === '' ? file.slice(prefix.length) : file}
                  </span>
                </button>
              ))}
              {files?.length === 0 && (
                <p className="text-muted-foreground grid h-full place-items-center text-sm">
                  No images in this project
                </p>
              )}
              {files !== null &&
                files.length > 0 &&
                search !== '' &&
                images.length === 0 && (
                  <p className="text-muted-foreground grid h-full place-items-center text-sm">
                    No matching images
                  </p>
                )}
            </div>
            {error !== null && (
              <p className="text-destructive border-t px-3 py-2 text-sm break-all">
                {error}
              </p>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

function Thumbnail(props: {
  machine: string
  projectId: string
  path: string
}) {
  const [src, setSrc] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    mediaUrl(props.machine, props.projectId, props.path).then(
      (url) => {
        if (!cancelled) {
          setSrc(url)
        }
      },
      () => {
        if (!cancelled) {
          setFailed(true)
        }
      }
    )
    return () => {
      cancelled = true
    }
  }, [props.machine, props.projectId, props.path])

  if (failed) {
    return (
      <HugeiconsIcon
        icon={Image01Icon}
        className="text-muted-foreground size-6 flex-none p-1"
      />
    )
  }
  if (src === null) {
    return <span className="bg-muted size-6 flex-none rounded-sm" />
  }
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      className="size-6 flex-none rounded-sm object-contain"
      onError={() => setFailed(true)}
    />
  )
}

function fileNameMatches(entry: FzfResultItem) {
  const start = entry.item.lastIndexOf('/') + 1
  return [...entry.positions].filter((position) => position >= start).length
}
