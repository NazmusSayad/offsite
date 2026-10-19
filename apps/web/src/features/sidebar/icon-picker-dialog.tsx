import {
  Cancel01Icon,
  Image01Icon,
  Search01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useEffect, useState } from 'react'
import { call } from '@/api/connection'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog'
import { errorMessage } from '@/lib/utils'

const IMAGE_FILE = /\.(png|jpe?g|gif|webp|svg)$/i

export function IconPickerDialog(props: {
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
                  if (preview.kind === 'image') {
                    props.onPick(
                      `data:${preview.mediaType};base64,${preview.data}`
                    )
                  } else if (preview.kind === 'large') {
                    setError(`${file} is too large`)
                  } else {
                    setError(`${file} is not an image`)
                  }
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
