import {
  Cancel01Icon,
  Delete02Icon,
  Folder01Icon,
  Upload04Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useRef, useState } from 'react'
import { removeProject, updateProject } from '@/api/projects'
import { readBase64 } from '@/api/upload'
import { ProjectBadge } from '@/components/icons'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  findIconMatches,
  type IconMatching,
} from '@/features/sidebar/icon-matches'
import { IconPickerDialog } from '@/features/sidebar/icon-picker-dialog'
import { projectName } from '@/lib/format'
import { type MachineProject } from '@/lib/store'
import { cn, errorMessage } from '@/lib/utils'

export function EditProjectDialog(props: {
  project: MachineProject
  onClose: () => void
  onRemoved: () => void
}) {
  const path = props.project.path
  const [name, setName] = useState(props.project.name)
  const [logo, setLogo] = useState(props.project.logo)
  const [setup, setSetup] = useState(props.project.worktreeSetup ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [picking, setPicking] = useState<{
    matching: IconMatching | null
  } | null>(null)
  const picker = useRef<HTMLInputElement>(null)

  return (
    <Dialog open onOpenChange={() => props.onClose()}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-md">
        <form
          className="grid grid-cols-1"
          onSubmit={async (event) => {
            event.preventDefault()
            setSaving(true)
            try {
              await updateProject(props.project.machine, props.project.id, {
                name,
                logo: logo === props.project.logo ? undefined : logo,
                worktreeSetup: setup,
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
                <div className="relative flex-none">
                  <ProjectBadge
                    name={name.trim() === '' ? projectName(path) : name}
                    logo={logo}
                    className="ring-foreground/10 size-16 rounded-2xl ring-1 [&>img]:rounded-2xl [&>svg]:rounded-2xl"
                  />
                  {logo !== null && (
                    <button
                      type="button"
                      className="bg-popover text-muted-foreground hover:text-foreground absolute -top-1.5 -right-1.5 grid size-5 cursor-pointer place-items-center rounded-full border shadow-xs"
                      title="Remove icon"
                      onClick={() => setLogo(null)}
                    >
                      <HugeiconsIcon icon={Cancel01Icon} className="size-3" />
                    </button>
                  )}
                </div>
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
                      onClick={() => setPicking({ matching: null })}
                    >
                      <HugeiconsIcon icon={Folder01Icon} />
                      Choose from project
                    </Button>
                  </div>
                  <p className="text-muted-foreground text-xs">
                    PNG, JPG, WebP, SVG or ICO
                    <br />
                    <span className="text-muted-foreground/80 text-[0.625rem]">
                      (SVG and ICO up to 384 KB)
                    </span>
                  </p>
                </div>
              </div>
              <input
                ref={picker}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml,image/x-icon"
                hidden
                onChange={async (event) => {
                  const file = event.target.files?.[0]
                  event.target.value = ''
                  if (file === undefined) {
                    return
                  }
                  const next = `data:${file.type};base64,${await readBase64(file)}`
                  try {
                    const matches = await findIconMatches(
                      next,
                      props.project.machine,
                      props.project.id
                    )
                    if (matches.length === 0) {
                      setLogo(next)
                      return
                    }
                    setPicking({ matching: { logo: next, matches } })
                  } catch (failure) {
                    setError(errorMessage(failure))
                  }
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
            <div className="grid gap-2">
              <Label htmlFor="project-setup">Setup for new worktrees</Label>
              <Input
                id="project-setup"
                placeholder="pnpm install"
                spellCheck={false}
                className="font-mono"
                value={setup}
                onChange={(event) => setSetup(event.target.value)}
              />
              <p className="text-muted-foreground text-xs">
                Runs in a terminal tab of each new worktree while the agent
                starts. $OFFSITE_ROOT is the project folder and
                $OFFSITE_WORKTREE is the worktree folder.
              </p>
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
        {picking !== null && (
          <IconPickerDialog
            machine={props.project.machine}
            projectId={props.project.id}
            matching={picking.matching}
            onClose={() => setPicking(null)}
            onPick={(next) => {
              setLogo(next)
              setPicking(null)
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
