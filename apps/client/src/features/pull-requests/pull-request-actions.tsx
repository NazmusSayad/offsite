import {
  AlertCircleIcon,
  ArrowDown01Icon,
  Cancel01Icon,
  CancelCircleIcon,
  CheckmarkCircle02Icon,
  Clock01Icon,
  Copy01Icon,
  EyeIcon,
  GitCommitIcon,
  GitCompareArrowsIcon,
  GitMergeIcon,
  GitPullRequestDraftIcon,
  Loading03Icon,
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
  AlertDialogAction,
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
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useCopy } from '@/lib/clipboard'
import { cn } from '@/lib/utils'

type Perform = (action: PullRequestAction, label: string) => Promise<boolean>

type Notice = { kind: PullRequestAction['kind']; text: string }

type Status = {
  text: string
  tone: 'good' | 'bad' | 'wait' | 'merged' | 'none'
  icon: IconSvgElement
}

const pendingLabels: Record<PullRequestAction['kind'], string> = {
  merge: 'Merging',
  close: 'Closing',
  reopen: 'Reopening',
  ready: 'Marking ready',
  draft: 'Converting to draft',
  checkout: 'Checking out',
  approve: 'Approving',
  requestChanges: 'Requesting changes',
  comment: 'Posting comment',
}

const methodLabels: Record<
  MergeMethod,
  { button: string; short: string; hint: string; icon: IconSvgElement }
> = {
  squash: {
    button: 'Squash and merge',
    short: 'Squash',
    hint: 'Combine into one commit',
    icon: GitCommitIcon,
  },
  merge: {
    button: 'Create a merge commit',
    short: 'Merge',
    hint: 'Keep commits, add a merge commit',
    icon: GitMergeIcon,
  },
  rebase: {
    button: 'Rebase and merge',
    short: 'Rebase',
    hint: 'Keep commits, no merge commit',
    icon: GitCompareArrowsIcon,
  },
}

export function PullRequestActions(props: {
  url: string
  details: PullRequestDetails | null
  busy: PullRequestAction['kind'] | null
  notice: Notice | null
  onPerform: Perform
}) {
  const details = props.details
  const [merging, setMerging] = useState(false)
  const [savedMethod, setSavedMethod] = useLocalStorage<MergeMethod>(
    `pullRequestMergeMethod:${props.url}`,
    'squash'
  )
  const [cleanup, setCleanup] = useLocalStorage('pullRequestDeleteBranch', true)
  const disabled = details === null || props.busy !== null
  const method =
    details === null || details.methods.includes(savedMethod)
      ? savedMethod
      : (details.methods[0] ?? null)
  const mergeable =
    details === null || (details.state === 'OPEN' && !details.draft)
  const showCleanup = mergeable && details?.crossRepository !== true

  return (
    <div className="border-border/60 bg-background @container flex shrink-0 items-center gap-2 border-t px-3 py-2">
      <div className="min-w-0 flex-1">
        {details !== null && (
          <MergeStatus
            details={details}
            busy={props.busy}
            notice={props.notice}
          />
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon-sm"
              variant="ghost"
              title="More actions"
              aria-label="More actions"
              disabled={disabled}
            >
              <HugeiconsIcon icon={MoreHorizontalIcon} className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {details !== null && (
              <MoreItems
                details={details}
                cleanup={showCleanup ? cleanup : null}
                onCleanup={setCleanup}
                onPerform={props.onPerform}
              />
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        {details !== null && details.state === 'OPEN' && details.draft && (
          <Button
            size="sm"
            disabled={disabled}
            onClick={() =>
              void props.onPerform({ kind: 'ready' }, 'Marked ready for review')
            }
          >
            {props.busy === 'ready' && (
              <HugeiconsIcon icon={Loading03Icon} className="animate-spin" />
            )}
            Ready for review
          </Button>
        )}
        {mergeable && method === null && (
          <Button
            size="sm"
            disabled
            title="This repository allows no merge method"
          >
            <HugeiconsIcon icon={GitMergeIcon} />
            Merge
          </Button>
        )}
        {mergeable && method !== null && (
          <div className="flex">
            <Button
              size="sm"
              className="rounded-r-none [&:active:not([aria-haspopup])]:scale-100"
              disabled={disabled}
              onClick={() => setMerging(true)}
            >
              <HugeiconsIcon
                icon={
                  props.busy === 'merge'
                    ? Loading03Icon
                    : methodLabels[method].icon
                }
                className={cn(props.busy === 'merge' && 'animate-spin')}
              />
              <span className="@max-md:hidden">
                {methodLabels[method].button}
              </span>
              <span className="@md:hidden">{methodLabels[method].short}</span>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  className="relative rounded-l-none px-1.5 before:absolute before:inset-y-1.5 before:-left-px before:w-px before:bg-white/20"
                  disabled={disabled}
                  title="Choose how to merge"
                  aria-label="Choose how to merge"
                >
                  <HugeiconsIcon icon={ArrowDown01Icon} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                {details !== null && (
                  <MethodItems
                    methods={details.methods}
                    method={method}
                    onMethod={setSavedMethod}
                  />
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
        {details !== null && details.state === 'CLOSED' && (
          <Button
            size="sm"
            variant="outline"
            disabled={disabled}
            onClick={() =>
              void props.onPerform({ kind: 'reopen' }, 'Pull request reopened')
            }
          >
            {props.busy === 'reopen' && (
              <HugeiconsIcon icon={Loading03Icon} className="animate-spin" />
            )}
            Reopen
          </Button>
        )}
      </div>
      <AlertDialog open={merging} onOpenChange={setMerging}>
        <AlertDialogContent focus="action">
          {details !== null && method !== null && (
            <MergeDialog
              details={details}
              method={method}
              cleanup={cleanup && !details.crossRepository}
              onConfirm={() =>
                void props.onPerform(
                  {
                    kind: 'merge',
                    method,
                    deleteBranch: cleanup && !details.crossRepository,
                  },
                  `Merged #${details.number}`
                )
              }
            />
          )}
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function MethodItems(props: {
  methods: MergeMethod[]
  method: MergeMethod
  onMethod: (method: MergeMethod) => void
}) {
  return (
    <DropdownMenuRadioGroup
      value={props.method}
      onValueChange={(value) => {
        const method = props.methods.find((item) => item === value)
        if (method === undefined) {
          throw new Error(`unknown merge method ${value}`)
        }
        props.onMethod(method)
      }}
    >
      {props.methods.map((item) => (
        <DropdownMenuRadioItem key={item} value={item} className="items-start">
          <span className="grid gap-0.5">
            <span className="text-foreground">{methodLabels[item].button}</span>
            <span className="text-muted-foreground text-xs">
              {methodLabels[item].hint}
            </span>
          </span>
        </DropdownMenuRadioItem>
      ))}
    </DropdownMenuRadioGroup>
  )
}

function MoreItems(props: {
  details: PullRequestDetails
  cleanup: boolean | null
  onCleanup: (cleanup: boolean) => void
  onPerform: Perform
}) {
  const details = props.details
  const clipboard = useCopy()

  return (
    <>
      {props.cleanup !== null && (
        <>
          <DropdownMenuCheckboxItem
            checked={props.cleanup}
            onCheckedChange={props.onCleanup}
            onSelect={(event) => event.preventDefault()}
          >
            Delete branch after merge
          </DropdownMenuCheckboxItem>
          <DropdownMenuSeparator />
        </>
      )}
      {details.state !== 'MERGED' &&
        details.local &&
        details.head !== details.current && (
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
  method: MergeMethod
  cleanup: boolean
  onConfirm: () => void
}) {
  const details = props.details
  const waiting =
    details.checks === 'pending' ||
    details.checks === 'failing' ||
    details.mergeState === 'BLOCKED'

  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>
          {methodLabels[props.method].button} #{details.number}?
        </AlertDialogTitle>
        <AlertDialogDescription>
          Merge <code>{details.head}</code> into <code>{details.base}</code>
          {props.cleanup ? ', then delete the branch.' : '.'}
          {waiting &&
            ' If checks or reviews are still needed, GitHub merges it later, when they pass.'}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>No</AlertDialogCancel>
        <AlertDialogAction
          icon={methodLabels[props.method].icon}
          onClick={props.onConfirm}
        >
          Yes, merge
        </AlertDialogAction>
      </AlertDialogFooter>
    </>
  )
}

function MergeStatus(props: {
  details: PullRequestDetails
  busy: PullRequestAction['kind'] | null
  notice: Notice | null
}) {
  const status =
    props.busy !== null
      ? {
          text: pendingLabels[props.busy],
          tone: 'none' as const,
          icon: Loading03Icon,
        }
      : props.notice !== null
        ? noticeStatus(props.notice)
        : mergeStatus(props.details)
  if (status === null) {
    return null
  }
  return (
    <p
      role="status"
      title={status.text}
      className={cn(
        'flex items-center gap-1.5 text-xs font-medium',
        status.tone === 'good' && 'text-success',
        status.tone === 'bad' && 'text-destructive',
        status.tone === 'wait' && 'text-warning',
        status.tone === 'merged' && 'text-violet-500',
        status.tone === 'none' && 'text-muted-foreground'
      )}
    >
      <HugeiconsIcon
        icon={status.icon}
        className={cn(
          'size-3.5 shrink-0',
          props.busy !== null && 'animate-spin'
        )}
      />
      <span className="truncate">{status.text}</span>
    </p>
  )
}

function noticeStatus(notice: Notice): Status {
  if (notice.kind === 'merge') {
    return { text: notice.text, tone: 'merged', icon: GitMergeIcon }
  }
  if (notice.kind === 'close') {
    return { text: notice.text, tone: 'bad', icon: CancelCircleIcon }
  }
  return { text: notice.text, tone: 'good', icon: CheckmarkCircle02Icon }
}

function mergeStatus(details: PullRequestDetails): Status | null {
  if (details.state !== 'OPEN' || details.draft) {
    return null
  }
  if (details.mergeable === 'CONFLICTING') {
    return {
      text: 'Conflicts with the base branch',
      tone: 'bad',
      icon: AlertCircleIcon,
    }
  }
  if (details.checks === 'failing') {
    return { text: 'Some checks failed', tone: 'bad', icon: CancelCircleIcon }
  }
  if (details.review === 'CHANGES_REQUESTED') {
    return { text: 'Changes requested', tone: 'bad', icon: AlertCircleIcon }
  }
  if (details.checks === 'pending') {
    return { text: 'Checks are running', tone: 'wait', icon: Clock01Icon }
  }
  if (details.review === 'REVIEW_REQUIRED') {
    return { text: 'Review required', tone: 'wait', icon: EyeIcon }
  }
  return { text: 'Ready to merge', tone: 'good', icon: CheckmarkCircle02Icon }
}
