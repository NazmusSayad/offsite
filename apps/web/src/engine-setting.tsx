import { useState } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { type Config, saveConfig } from '@/config'
import type { Engine } from '@/engine'
import { restart } from '@/restart'
import { Row, Section } from '@/settings-layout'

export function EngineSetting(props: {
  draft: Config
  onSwitch: (config: Config) => void
}) {
  const [pending, setPending] = useState<Engine | null>(null)
  const [switching, setSwitching] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function switchEngine() {
    if (pending === null) throw new Error('no terminal engine is selected')
    const next = { ...props.draft, engine: pending }
    props.onSwitch(next)
    setPending(null)
    setSwitching(true)
    setError(null)
    try {
      await saveConfig(next)
      await restart('everything')
    } catch (failure) {
      setSwitching(false)
      setError(failure instanceof Error ? failure.message : String(failure))
    }
  }

  return (
    <Section title="Terminal engine" note="Changing it restarts everything">
      <Row label="Engine">
        <Select
          value={props.draft.engine}
          disabled={switching}
          onValueChange={(engine: Engine) => setPending(engine)}
        >
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ghostty">Ghostty</SelectItem>
            <SelectItem value="xterm">xterm.js</SelectItem>
          </SelectContent>
        </Select>
      </Row>
      {switching && (
        <p className="text-muted-foreground px-4 py-2.5 text-sm">Restarting…</p>
      )}
      {error && (
        <p className="text-destructive px-4 py-2.5 text-sm break-words">
          {error}
        </p>
      )}
      <AlertDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Switch the terminal engine?</AlertDialogTitle>
            <AlertDialogDescription>
              sshtty restarts everything. Every open terminal and anything
              running in it will be ended. Your groups and tabs stay and open
              with fresh shells in the new engine.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => void switchEngine()}
            >
              Switch and restart
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Section>
  )
}
