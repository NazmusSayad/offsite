import {
  LinkIcon,
  ArchiveArrowDownIcon,
  ArrowReloadHorizontalIcon,
  CancelCircleIcon,
  CheckmarkCircle02Icon,
} from '@hugeicons/core-free-icons'
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
  linked: 'Linked',
  link: 'Link',
  relink: 'Replace old link',
  replace: 'Replace empty folder',
  backup: 'Back up, then link',
  skip: 'Skip',
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
    result !== null &&
    result.entries.some(
      (item) => item.action !== 'linked' && item.action !== 'skip'
    )

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
            `${name} will share threads, plans, tasks and settings with your main Claude folder. Its running threads stop first. Its own files are kept as backups.`}
          {result !== null &&
            !failed &&
            `${name} now shares threads with your main Claude folder. You can pick it in the composer.`}
          {result !== null &&
            failed &&
            'Some items did not link. Fix the problem below, then link again.'}
        </AlertDialogDescription>
      </AlertDialogHeader>
      {plan === null && error === null && (
        <p className="text-muted-foreground text-sm">Checking {name}…</p>
      )}
      {plan !== null && (
        <div className="max-h-80 overflow-y-auto rounded-lg border py-1 text-xs">
          {plan.entries
            .filter((item) => item.action !== 'skip')
            .map((item) => (
              <LinkRow
                key={item.name}
                plan={plan}
                planned={item}
                result={
                  result?.entries.find((entry) => entry.name === item.name) ??
                  null
                }
              />
            ))}
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

function LinkRow(props: {
  plan: LinkPlan
  planned: LinkEntry
  result: LinkEntry | null
}) {
  const planned = props.planned
  const result = props.result
  const state =
    result === null
      ? planned.action
      : result.action === 'linked'
        ? 'linked'
        : 'failed'
  const entry = `${planned.name}${planned.type === 'folder' ? '/' : ''}`
  return (
    <div
      className={cn(
        'grid grid-cols-[1fr_1fr_auto] items-center gap-3 px-3 py-1.5 font-mono',
        state === 'linked' && result === null && 'text-muted-foreground'
      )}
    >
      <span className="truncate">
        {folderName(props.plan.baseDir)}/{entry}
      </span>
      <span className="truncate">
        {folderName(props.plan.configDir)}/{entry}
      </span>
      <span
        title={`${
          result === null
            ? plannedLabels[planned.action]
            : resultLabel(planned, result)
        }${result === null && planned.createInBase ? ' · creates it in main' : ''}`}
      >
        <HugeiconsIcon
          icon={
            state === 'linked'
              ? CheckmarkCircle02Icon
              : state === 'failed'
                ? CancelCircleIcon
                : state === 'backup'
                  ? ArchiveArrowDownIcon
                  : state === 'link'
                    ? LinkIcon
                    : ArrowReloadHorizontalIcon
          }
          className={cn(
            'size-4',
            state === 'linked' && 'text-success',
            state === 'failed' && 'text-destructive',
            state === 'backup' && 'text-warning',
            (state === 'link' || state === 'relink' || state === 'replace') &&
              'text-info'
          )}
        />
      </span>
    </div>
  )
}

function folderName(dir: string) {
  const name = dir
    .split(/[\\/]/)
    .filter((part) => part !== '')
    .at(-1)
  if (name === undefined) {
    throw new Error(`Not a folder path: ${dir}`)
  }
  return name
}

function resultLabel(planned: LinkEntry, result: LinkEntry) {
  if (result.action !== 'linked') {
    return 'Not linked'
  }
  if (planned.action === 'backup') {
    return 'Linked · old one backed up'
  }
  return 'Linked'
}
