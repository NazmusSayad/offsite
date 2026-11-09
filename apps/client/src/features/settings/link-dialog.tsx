import { ArrowRight02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { Platform } from '@offsite/core/config'
import type { Account, LinkEntry, LinkPlan } from '@offsite/core/providers'
import { useEffect, useState } from 'react'
import { call } from '@/api/connection'
import {
  AlertDialogCancel,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { cn, errorMessage } from '@/lib/utils'

const plannedLabels = {
  linked: 'Already linked',
  link: 'Link',
  relink: 'Replace old link',
  replace: 'Replace empty folder',
  backup: 'Back up, then link',
}

export function LinkDialog(props: {
  machine: string
  platform: Platform
  account: Account
}) {
  const [plan, setPlan] = useState<LinkPlan | null>(null)
  const [result, setResult] = useState<LinkPlan | null>(null)
  const [linking, setLinking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let current = true
    async function load() {
      try {
        const loaded = await call(props.machine, 'accounts.linkPlan', {
          id: props.account.id,
        })
        if (current) {
          setPlan(loaded)
        }
      } catch (caught) {
        if (current) {
          setError(errorMessage(caught))
        }
      }
    }
    void load()
    return () => {
      current = false
    }
  }, [props.machine, props.account.id])

  async function link() {
    setLinking(true)
    setError(null)
    try {
      await call(props.machine, 'accounts.link', { id: props.account.id })
    } catch (caught) {
      setError(errorMessage(caught))
    }
    try {
      setResult(
        await call(props.machine, 'accounts.linkPlan', { id: props.account.id })
      )
    } catch (caught) {
      setError(errorMessage(caught))
    }
    setLinking(false)
  }

  const name = props.account.name
  const failed =
    result !== null && result.entries.some((item) => item.action !== 'linked')

  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>
          {result === null && `Link ${name} to shared threads?`}
          {result !== null && !failed && `${name} is linked`}
          {result !== null && failed && `${name} is not fully linked`}
        </AlertDialogTitle>
        <AlertDialogDescription>
          {result === null &&
            `${name} will use the threads, plans, tasks and settings in your main Claude folder. Anything with content is renamed to a backup, never deleted. Threads running on ${name} stop first.`}
          {result !== null &&
            !failed &&
            `${name} now shares threads with your main Claude folder and shows in the composer.`}
          {result !== null &&
            failed &&
            'Some entries could not be linked. Fix the problem below and link again.'}
        </AlertDialogDescription>
      </AlertDialogHeader>
      {plan === null && error === null && (
        <p className="text-muted-foreground text-sm">Checking {name}…</p>
      )}
      {plan !== null && (
        <div className="overflow-hidden rounded-lg border text-xs">
          <div className="bg-muted/40 flex items-center gap-2 border-b px-3 py-2 font-mono">
            <span className="min-w-0 flex-1 truncate" title={plan.configDir}>
              {plan.configDir}
            </span>
            <HugeiconsIcon
              icon={ArrowRight02Icon}
              className="text-muted-foreground size-3.5 shrink-0"
            />
            <span className="min-w-0 flex-1 truncate" title={plan.baseDir}>
              {plan.baseDir}
            </span>
          </div>
          <div className="max-h-72 overflow-y-auto py-1">
            <LinkSection
              title="Required"
              entries={plan.entries.filter((item) => item.required)}
              result={result}
            />
            <LinkSection
              title="Optional"
              entries={plan.entries.filter((item) => !item.required)}
              result={result}
            />
          </div>
        </div>
      )}
      {linking && props.platform === 'windows' && (
        <p className="text-warning text-xs">
          Approve the admin prompt on the Windows computer if it asks.
        </p>
      )}
      {error !== null && (
        <p className="text-destructive text-xs break-words">{error}</p>
      )}
      <AlertDialogFooter>
        {result === null && (
          <>
            <AlertDialogCancel disabled={linking}>Cancel</AlertDialogCancel>
            <Button
              disabled={plan === null || linking}
              onClick={() => void link()}
            >
              {linking ? 'Linking…' : 'Link'}
            </Button>
          </>
        )}
        {result !== null && failed && (
          <>
            <AlertDialogCancel>Close</AlertDialogCancel>
            <Button
              onClick={() => {
                setPlan(result)
                setResult(null)
                setError(null)
              }}
            >
              Try again
            </Button>
          </>
        )}
        {result !== null && !failed && (
          <AlertDialogCancel variant="default">Done</AlertDialogCancel>
        )}
      </AlertDialogFooter>
    </>
  )
}

function LinkSection(props: {
  title: string
  entries: LinkEntry[]
  result: LinkPlan | null
}) {
  return (
    <div className="not-first:pt-1.5">
      <p className="text-muted-foreground px-3 pt-1.5 pb-1">{props.title}</p>
      {props.entries.map((item) => (
        <LinkRow
          key={item.name}
          planned={item}
          result={
            props.result?.entries.find((entry) => entry.name === item.name) ??
            null
          }
        />
      ))}
    </div>
  )
}

function LinkRow(props: { planned: LinkEntry; result: LinkEntry | null }) {
  const planned = props.planned
  const result = props.result
  const unchanged = planned.action === 'linked'
  return (
    <div className="flex items-center gap-3 px-3 py-1">
      <span
        className={cn(
          'min-w-0 flex-1 truncate font-mono',
          unchanged && 'text-muted-foreground'
        )}
      >
        {planned.name}
        {planned.type === 'folder' && '/'}
      </span>
      <span
        className={cn(
          'shrink-0',
          unchanged && 'text-muted-foreground',
          result === null && planned.action === 'backup' && 'text-warning',
          !unchanged && result?.action === 'linked' && 'text-success',
          !unchanged &&
            result !== null &&
            result.action !== 'linked' &&
            'text-destructive'
        )}
      >
        {result === null
          ? plannedLabels[planned.action]
          : resultLabel(planned, result)}
        {result === null && planned.createInBase && !unchanged && (
          <span className="text-muted-foreground"> · new in main</span>
        )}
      </span>
    </div>
  )
}

function resultLabel(planned: LinkEntry, result: LinkEntry) {
  if (planned.action === 'linked') {
    return 'Already linked'
  }
  if (result.action !== 'linked') {
    return 'Not linked'
  }
  if (planned.action === 'backup') {
    return 'Linked · old one backed up'
  }
  return 'Linked'
}
