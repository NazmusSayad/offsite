import { HugeiconsIcon } from '@hugeicons/react'
import { useState } from 'react'
import { home, readMachineLink } from '@/api/machines'
import { editMachine } from '@/api/sync'
import { type MachineIcon, machineIcons } from '@/components/icons'
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
import type { Machine } from '@/lib/store'
import { errorMessage } from '@/lib/utils'
import { MachineForm } from './machine-form'

export function AddMachineDialog(props: { onClose: () => void }) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) props.onClose()
      }}
    >
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-md">
        <DialogHeader className="gap-1 px-6 pt-4 pr-12">
          <DialogTitle className="text-base">Add machine</DialogTitle>
          <DialogDescription>
            Paste the pairing link that offsite printed when it started.
          </DialogDescription>
        </DialogHeader>
        <MachineForm
          fieldsClassName="p-6"
          onAdded={props.onClose}
          actions={(ready) => (
            <DialogFooter className="bg-muted/40 border-t px-6 py-4">
              <Button type="button" variant="outline" onClick={props.onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={!ready}>
                Add machine
              </Button>
            </DialogFooter>
          )}
        />
      </DialogContent>
    </Dialog>
  )
}

export function EditMachineDialog(props: {
  machine: Machine
  onClose: () => void
}) {
  const [label, setLabel] = useState(props.machine.label ?? '')
  const [icon, setIcon] = useState(props.machine.icon)
  const [url, setUrl] = useState(props.machine.url)
  const [fallback, setFallback] = useState(props.machine.fallback ?? '')
  const [token, setToken] = useState(props.machine.token ?? '')
  const [error, setError] = useState<string | null>(null)

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) props.onClose()
      }}
    >
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-md">
        <form
          className="grid"
          onSubmit={(event) => {
            event.preventDefault()
            try {
              editMachine(props.machine.origin, {
                label: label.trim() === '' ? null : label.trim(),
                icon,
                token: token.trim() === '' ? null : token.trim(),
                ...(props.machine.origin !== home && {
                  url: readMachineLink(url).origin,
                  fallback:
                    fallback.trim() === ''
                      ? null
                      : readMachineLink(fallback).origin,
                }),
              })
              props.onClose()
            } catch (failure) {
              setError(errorMessage(failure))
            }
          }}
        >
          <DialogHeader className="gap-1 px-6 pt-4 pr-12">
            <DialogTitle className="text-base">Edit machine</DialogTitle>
            <DialogDescription>
              {props.machine.origin === home
                ? 'This machine serves this page, so its address stays.'
                : 'Offsite tries the URL first, then the fallback, whenever it reconnects.'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-6 p-6">
            <div className="grid gap-2.5">
              <Label>Icon</Label>
              <div className="flex flex-wrap gap-2">
                {Object.entries(machineIcons).map((entry) => (
                  <Button
                    key={entry[0]}
                    type="button"
                    size="icon"
                    variant={entry[0] === icon ? 'default' : 'outline'}
                    title={entry[0]}
                    aria-pressed={entry[0] === icon}
                    onClick={() => setIcon(entry[0] as MachineIcon)}
                  >
                    <HugeiconsIcon icon={entry[1]} />
                  </Button>
                ))}
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="machine-name">Name</Label>
              <Input
                id="machine-name"
                placeholder={props.machine.hostname}
                value={label}
                onChange={(event) => setLabel(event.target.value)}
              />
            </div>
            {props.machine.origin !== home && (
              <>
                <div className="grid gap-2">
                  <Label htmlFor="machine-url">URL</Label>
                  <Input
                    id="machine-url"
                    placeholder="e.g. http://192.168.1.10:47841"
                    spellCheck={false}
                    autoComplete="off"
                    value={url}
                    onChange={(event) => setUrl(event.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="machine-fallback">Fallback URL</Label>
                  <Input
                    id="machine-fallback"
                    placeholder="Optional, e.g. a Cloudflare tunnel"
                    spellCheck={false}
                    autoComplete="off"
                    value={fallback}
                    onChange={(event) => setFallback(event.target.value)}
                  />
                </div>
              </>
            )}
            <div className="grid gap-2">
              <Label htmlFor="machine-token">Pairing token</Label>
              <Input
                id="machine-token"
                placeholder="Empty if auth is off"
                spellCheck={false}
                autoComplete="off"
                value={token}
                onChange={(event) => setToken(event.target.value)}
              />
            </div>
            {error !== null && (
              <p className="text-destructive text-sm break-all">{error}</p>
            )}
          </div>
          <DialogFooter className="bg-muted/40 border-t px-6 py-4">
            <Button type="button" variant="outline" onClick={props.onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={props.machine.origin !== home && url.trim() === ''}
            >
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
