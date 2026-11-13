import {
  Cancel01Icon,
  Copy01Icon,
  GitCommitIcon,
  GitCompareArrowsIcon,
  GitMergeIcon,
  GitPullRequestDraftIcon,
  MoreHorizontalIcon,
  ThumbsUpIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react'
import { BranchIcon } from '@offsite/core/icons/git'
import type {
  MergeMethod,
  PullRequestAction,
  PullRequestDetails,
} from '@offsite/core/pull-requests'
import { useState } from 'react'
import { useLocalStorage } from 'usehooks-ts'

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Switch } from '@/components/ui/switch'
import { useCopy } from '@/lib/clipboard'
import { cn } from '@/lib/utils'

type Perform = (action: PullRequestAction, label: string) => Promise<boolean>

const methodLabels: Record<
  MergeMethod,
  { button: string; hint: string; icon: IconSvgElement }
> = {
  squash: {
    button: 'Squash and merge',
    hint: 'Combine into one commit',
    icon: GitCommitIcon,
  },
  merge: {
    button: 'Create a merge commit',
    hint: 'Keep commits, add a merge commit',
    icon: GitMergeIcon,
  },
  rebase: {
    button: 'Rebase and merge',
    hint: 'Keep commits, no merge commit',
    icon: GitCompareArrowsIcon,
  },
}

export function PullRequestActions(props: {
  details: PullRequestDetails
  busy: string | null
  notice: string | null
  onPerform: Perform
}) {
  const details = props.details
  const [merging, setMerging] = useState(false)
  const status = mergeStatus(details)
  const tone =
    props.busy === null && props.notice !== null ? 'good' : status.tone

  return (
    <div className="border-border/60 bg-background flex shrink-0 items-center gap-2 border-t px-3 py-2">
      <span
        className={cn(
          'min-w-0 flex-1 truncate text-xs',
          tone === 'good' && 'text-success',
          tone === 'bad' && 'text-destructive',
          tone === 'wait' && 'text-warning',
          tone === 'none' && 'text-muted-foreground'
        )}
      >
        {props.busy ?? props.notice ?? status.text}
      </span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="icon-sm"
            variant="ghost"
            title="More actions"
            aria-label="More actions"
            disabled={props.busy !== null}
          >
            <HugeiconsIcon icon={MoreHorizontalIcon} className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <MoreItems details={details} onPerform={props.onPerform} />
        </DropdownMenuContent>
      </DropdownMenu>
      {details.state === 'OPEN' && details.draft && (
        <Button
          size="sm"
          disabled={props.busy !== null}
          onClick={() =>
            void props.onPerform({ kind: 'ready' }, 'Marked ready for review')
          }
        >
          Ready for review
        </Button>
      )}
      {details.state === 'OPEN' && !details.draft && (
        <Button
          size="sm"
          disabled={props.busy !== null}
          onClick={() => setMerging(true)}
        >
          Merge
        </Button>
      )}
      {details.state === 'CLOSED' && (
        <Button
          size="sm"
          variant="outline"
          disabled={props.busy !== null}
          onClick={() =>
            void props.onPerform({ kind: 'reopen' }, 'Pull request reopened')
          }
        >
          Reopen
        </Button>
      )}
      <AlertDialog open={merging} onOpenChange={setMerging}>
        <AlertDialogContent>
          <MergeDialog
            details={details}
            onConfirm={(action, label) => {
              setMerging(false)
              void props.onPerform(action, label)
            }}
          />
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function MoreItems(props: { details: PullRequestDetails; onPerform: Perform }) {
  const details = props.details
  const clipboard = useCopy()

  return (
    <>
      {details.state !== 'MERGED' && details.head !== details.current && (
        <DropdownMenuItem
          onSelect={() =>
            void props.onPerform(
              { kind: 'checkout' },
              `Checked out ${details.head}`
            )
          }
        >
          <HugeiconsIcon icon={BranchIcon} />
          Check out branch
        </DropdownMenuItem>
      )}
      {details.state === 'OPEN' && details.author !== details.viewer && (
        <DropdownMenuItem
          onSelect={() =>
            void props.onPerform({ kind: 'approve' }, 'Pull request approved')
          }
        >
          <HugeiconsIcon icon={ThumbsUpIcon} />
          Approve
        </DropdownMenuItem>
      )}
      {details.state === 'OPEN' && !details.draft && (
        <DropdownMenuItem
          onSelect={() =>
            void props.onPerform({ kind: 'draft' }, 'Converted to draft')
          }
        >
          <HugeiconsIcon icon={GitPullRequestDraftIcon} />
          Convert to draft
        </DropdownMenuItem>
      )}
      <DropdownMenuItem onSelect={() => void clipboard.copy(details.url)}>
        <HugeiconsIcon icon={Copy01Icon} />
        Copy link
      </DropdownMenuItem>
      {details.state === 'OPEN' && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onSelect={() =>
              void props.onPerform({ kind: 'close' }, 'Pull request closed')
            }
          >
            <HugeiconsIcon icon={Cancel01Icon} />
            Close pull request
          </DropdownMenuItem>
        </>
      )}
    </>
  )
}

function MergeDialog(props: {
  details: PullRequestDetails
  onConfirm: (action: PullRequestAction, label: string) => void
}) {
  const details = props.details
  const [savedMethod, setSavedMethod] = useLocalStorage<MergeMethod>(
    'pullRequestMergeMethod',
    'squash'
  )
  const [deleteBranch, setDeleteBranch] = useLocalStorage(
    'pullRequestDeleteBranch',
    true
  )
  const method = details.methods.includes(savedMethod)
    ? savedMethod
    : (details.methods[0] ?? null)
  const waiting =
    details.checks === 'pending' ||
    details.checks === 'failing' ||
    details.mergeState === 'BLOCKED'

  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>Merge #{details.number}?</AlertDialogTitle>
        <AlertDialogDescription>
          Merge <code>{details.head}</code> into <code>{details.base}</code>.
          {waiting &&
            ' If required checks or reviews are still missing, GitHub turns on auto-merge instead.'}
        </AlertDialogDescription>
      </AlertDialogHeader>
      {method === null && (
        <p className="text-destructive text-sm">
          This repository does not allow any merge method.
        </p>
      )}
      {method !== null && (
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            {details.methods.map((item) => (
              <button
                key={item}
                type="button"
                aria-pressed={item === method}
                className="group border-border hover:bg-accent/50 aria-pressed:border-primary aria-pressed:bg-primary/6 flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-left"
                onClick={() => setSavedMethod(item)}
              >
                <HugeiconsIcon
                  icon={methodLabels[item].icon}
                  className="text-muted-foreground group-aria-pressed:text-primary size-5 shrink-0"
                />
                <span className="grid gap-0.5">
                  <span className="text-foreground text-sm font-medium">
                    {methodLabels[item].button}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {methodLabels[item].hint}
                  </span>
                </span>
              </button>
            ))}
          </div>
          {!details.crossRepository && (
            <label className="flex cursor-pointer items-center justify-between gap-3 text-sm">
              <span className="min-w-0 truncate">
                Delete{' '}
                <span className="text-muted-foreground font-mono text-xs">
                  {details.head}
                </span>
              </span>
              <Switch
                checked={deleteBranch}
                onCheckedChange={setDeleteBranch}
              />
            </label>
          )}
        </div>
      )}
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        {method !== null && (
          <Button
            onClick={() =>
              props.onConfirm(
                {
                  kind: 'merge',
                  method,
                  deleteBranch: !details.crossRepository && deleteBranch,
                },
                `Merged #${details.number}`
              )
            }
          >
            <HugeiconsIcon icon={methodLabels[method].icon} />
            {methodLabels[method].button}
          </Button>
        )}
      </AlertDialogFooter>
    </>
  )
}

function mergeStatus(details: PullRequestDetails): {
  text: string
  tone: 'good' | 'bad' | 'wait' | 'none'
} {
  if (details.state === 'MERGED') {
    return { text: 'Merged', tone: 'none' }
  }
  if (details.state === 'CLOSED') {
    return { text: 'Closed without merging', tone: 'none' }
  }
  if (details.draft) {
    return { text: 'Draft', tone: 'none' }
  }
  if (details.mergeable === 'CONFLICTING') {
    return { text: 'Conflicts with the base branch', tone: 'bad' }
  }
  if (details.checks === 'failing') {
    return { text: 'Some checks failed', tone: 'bad' }
  }
  if (details.review === 'CHANGES_REQUESTED') {
    return { text: 'Changes requested', tone: 'bad' }
  }
  if (details.checks === 'pending') {
    return { text: 'Checks are running', tone: 'wait' }
  }
  if (details.review === 'REVIEW_REQUIRED') {
    return { text: 'Review required', tone: 'wait' }
  }
  return { text: 'Ready to merge', tone: 'good' }
}
