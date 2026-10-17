import {
  CheckIcon,
  CheckmarkCircle02Icon,
  CircleDashedIcon,
  HelpCircleIcon,
  MessageCircleQuestionMarkIcon,
  ShieldAlertIcon,
  XIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { PermissionRequest, Question } from '@offsite/core/protocol'
import { useEffect, useState } from 'react'
import { uploadFile } from '@/api/upload'
import { Markdown } from '@/components/markdown/markdown'
import { Button } from '@/components/ui/button'
import { summary, ToolDetails } from '@/features/transcript/tool-details'
import { respond } from '@/lib/sessions'
import { showError } from '@/lib/store'
import { cn } from '@/lib/utils'

const recommendedSuffix = '(Recommended)'

function recommendations(question: Question) {
  const labels = question.options
    .map((option) => option.label)
    .filter((label) => label.endsWith(recommendedSuffix))
  return question.multiSelect ? labels : labels.slice(0, 1)
}

function Mark(props: {
  multi: boolean
  selected: boolean
  suggested: boolean
}) {
  return (
    <span
      className={cn(
        'mt-0.5 grid size-4 shrink-0 place-items-center border transition-colors',
        props.multi ? 'rounded' : 'rounded-full',
        props.selected && 'border-primary bg-primary text-primary-foreground',
        props.suggested && 'border-primary border-dashed',
        !props.selected && !props.suggested && 'border-muted-foreground/40'
      )}
    >
      {props.selected && props.multi && (
        <HugeiconsIcon icon={CheckIcon} strokeWidth={3} className="size-3" />
      )}
      {props.selected && !props.multi && (
        <span className="bg-primary-foreground size-1.5 rounded-full" />
      )}
    </span>
  )
}

function Countdown(props: { at: number; label: string }) {
  const [now, setNow] = useState(Date.now)

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  const seconds = Math.max(0, Math.ceil((props.at - now) / 1000))
  return (
    <span>
      {props.label} in {Math.floor(seconds / 60)}:
      {String(seconds % 60).padStart(2, '0')}
    </span>
  )
}

const attached =
  'composer-glass relative mx-auto -mb-[calc(1rem+1px)] w-[calc(100%-2.75rem)] rounded-t-2xl border border-b-0 px-1 pt-1 pb-[calc(1rem+1px+0.25rem)] text-xs/4'

export function PermissionPrompt(props: {
  request: PermissionRequest
  machine: string
  cwd: string
  count: number
}) {
  const request = props.request
  if (request.kind === 'question') {
    return <QuestionPrompt machine={props.machine} request={request} />
  }
  const plan = request.kind === 'plan'
  const detail = plan ? '' : summary(request.item, props.cwd)
  return (
    <div
      className={cn(
        attached,
        'border-warning/28 bg-linear-to-b from-warning/8 to-warning/8'
      )}
    >
      <div className="grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-start gap-x-2 gap-y-3 px-1 py-1">
        <span className="text-warning flex justify-center pt-0.5">
          <HugeiconsIcon icon={ShieldAlertIcon} className="size-4" />
        </span>
        <span className="flex min-w-0 flex-col items-start gap-1">
          <span className="text-muted-foreground text-2xs flex w-full min-w-0 items-center gap-2">
            <span className="text-warning shrink-0 font-medium">
              {plan ? 'Ready to code?' : request.title}
            </span>
            <span className="ml-auto flex shrink-0 items-center gap-2 tabular-nums">
              {request.autoResolve !== undefined && (
                <Countdown
                  at={request.autoResolve.at}
                  label={
                    request.autoResolve.decision === 'allow'
                      ? 'Auto-approves'
                      : 'Auto-declines'
                  }
                />
              )}
              {props.count > 1 && <span>1/{props.count}</span>}
            </span>
          </span>
          {detail !== '' && (
            <span className="text-foreground block max-h-20 w-full min-w-0 overflow-auto font-mono text-xs whitespace-pre">
              {detail}
            </span>
          )}
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          <Button
            size="xs"
            variant="outline"
            onClick={() => respond(request.id, 'deny', null)}
          >
            {plan ? 'Keep planning' : 'Decline'}
          </Button>
          {request.kind === 'approval' && request.canAlwaysAllow && (
            <Button
              size="xs"
              variant="outline"
              onClick={() => respond(request.id, 'always', null)}
            >
              Always
            </Button>
          )}
          <Button size="xs" onClick={() => respond(request.id, 'allow', null)}>
            {plan ? 'Approve plan' : 'Approve'}
          </Button>
        </span>
        {plan && (
          <div className="col-span-3 max-h-60 overflow-auto px-1 empty:hidden">
            <Markdown text={request.plan} />
          </div>
        )}
        {request.kind === 'approval' && request.item.kind !== 'command' && (
          <div className="col-span-3 max-h-60 overflow-auto px-1 empty:hidden">
            <ToolDetails item={request.item} />
          </div>
        )}
      </div>
    </div>
  )
}

function QuestionPrompt(props: {
  machine: string
  request: Extract<PermissionRequest, { kind: 'question' }>
}) {
  const questions = props.request.questions
  const [active, setActive] = useState(0)
  const [picked, setPicked] = useState<Record<string, string[]>>({})
  const [other, setOther] = useState<Record<string, string>>({})
  const [uploads, setUploads] = useState(0)
  const explicit = Object.fromEntries(
    questions.map((item) => [
      item.question,
      [
        ...(picked[item.question] ?? []),
        other[item.question]?.trim() ?? '',
      ].filter((value) => value !== ''),
    ])
  )
  const answers = Object.fromEntries(
    questions.map((item) => [
      item.question,
      (explicit[item.question].length > 0
        ? explicit[item.question]
        : recommendations(item)
      ).join(', '),
    ])
  )
  const question = questions[active]
  const unanswered = questions.flatMap((item, index) =>
    explicit[item.question].length === 0 ? [index] : []
  )
  const next = unanswered.find((index) => index > active) ?? unanswered[0]

  function pick(question: Question, label: string) {
    const current = picked[question.question] ?? []
    if (question.multiSelect) {
      setPicked({
        ...picked,
        [question.question]: current.includes(label)
          ? current.filter((item) => item !== label)
          : [...current, label],
      })
      return
    }
    setPicked({ ...picked, [question.question]: [label] })
    setOther({ ...other, [question.question]: '' })
    if (active < questions.length - 1) {
      setActive(active + 1)
    }
  }

  function write(question: Question, value: string) {
    setOther({ ...other, [question.question]: value })
    if (!question.multiSelect && value.trim() !== '') {
      setPicked({ ...picked, [question.question]: [] })
    }
  }

  async function attach(question: Question, files: File[]) {
    for (const file of files) {
      setUploads((count) => count + 1)
      try {
        const path = await uploadFile(props.machine, file)
        setOther((current) => {
          const text = current[question.question] ?? ''
          return {
            ...current,
            [question.question]: `${text}${/(^|\s)$/.test(text) ? '' : ' '}${path}`,
          }
        })
        if (!question.multiSelect) {
          setPicked((current) => ({ ...current, [question.question]: [] }))
        }
      } catch (error) {
        showError(error)
      } finally {
        setUploads((count) => count - 1)
      }
    }
  }

  return (
    <div className="composer-glass shadow-composer relative z-10 rounded-3xl border border-(--composer-outline)">
      <div className="flex flex-col gap-2 p-2.5">
        <div
          key={question.question}
          role="tabpanel"
          className="flex min-w-0 flex-col gap-2"
        >
          <div className="mb-1 flex items-start gap-1.5 pt-1 pr-1 pl-1.5">
            <span className="bg-primary/18 text-primary grid size-6 shrink-0 place-items-center rounded-md">
              <HugeiconsIcon
                icon={MessageCircleQuestionMarkIcon}
                className="size-4"
              />
            </span>
            <p className="text-foreground min-w-0 flex-1 pt-0.5 text-[15px] leading-5 font-medium">
              {question.question}
            </p>
            <Button
              size="icon-xs"
              variant="ghost"
              aria-label="Skip questions"
              title="Skip questions"
              onClick={() => respond(props.request.id, 'deny', null)}
            >
              <HugeiconsIcon icon={XIcon} />
            </Button>
          </div>
          <div
            role={question.multiSelect ? 'group' : 'radiogroup'}
            aria-label={question.question}
            className="flex max-h-[min(18rem,32dvh)] flex-col gap-0.5 overflow-y-auto"
          >
            {question.options.map((option) => {
              const selected =
                picked[question.question]?.includes(option.label) === true
              const suggested =
                explicit[question.question].length === 0 &&
                recommendations(question).includes(option.label)
              const recommended = option.label.endsWith(recommendedSuffix)
              return (
                <button
                  key={option.label}
                  role={question.multiSelect ? 'checkbox' : 'radio'}
                  aria-checked={selected}
                  className={cn(
                    'flex cursor-pointer items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors',
                    selected ? 'bg-muted/70' : 'hover:bg-muted/40'
                  )}
                  onClick={() => pick(question, option.label)}
                >
                  <Mark
                    multi={question.multiSelect}
                    selected={selected}
                    suggested={suggested}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-2">
                      <span className="text-foreground text-sm">
                        {recommended
                          ? option.label
                              .slice(0, -recommendedSuffix.length)
                              .trim()
                          : option.label}
                      </span>
                      {recommended && (
                        <span className="text-muted-foreground/70 text-[11px]">
                          Recommended
                        </span>
                      )}
                    </span>
                    {option.description !== '' && (
                      <span className="text-secondary-label mt-0.5 block text-xs leading-4">
                        {option.description}
                      </span>
                    )}
                  </span>
                </button>
              )
            })}
            <label
              className={cn(
                'flex cursor-text items-start gap-2.5 rounded-lg px-2.5 py-2 transition-colors',
                (other[question.question] ?? '').trim() !== ''
                  ? 'bg-muted/70'
                  : 'focus-within:bg-muted/40 hover:bg-muted/40'
              )}
            >
              <Mark
                multi={question.multiSelect}
                selected={(other[question.question] ?? '').trim() !== ''}
                suggested={false}
              />
              <textarea
                value={other[question.question] ?? ''}
                rows={1}
                onChange={(event) => write(question, event.target.value)}
                onPaste={(event) => {
                  const text = event.clipboardData.getData('text/plain')
                  if (text !== '') {
                    event.preventDefault()
                    document.execCommand('insertText', false, text)
                    return
                  }
                  const files = [...event.clipboardData.files]
                  if (files.length === 0) {
                    return
                  }
                  event.preventDefault()
                  void attach(question, files)
                }}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault()
                  void attach(question, [...event.dataTransfer.files])
                }}
                placeholder="Something else…"
                className="placeholder:text-placeholder/75 [field-sizing:content] max-h-40 min-w-0 flex-1 resize-none bg-transparent text-sm leading-5 outline-none"
              />
            </label>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {questions.length > 1 && (
            <div
              role="tablist"
              className="flex min-w-0 [scrollbar-width:none] gap-1 overflow-x-auto"
            >
              {questions.map((item, index) => (
                <button
                  key={item.question}
                  role="tab"
                  aria-selected={index === active}
                  className={cn(
                    'flex h-6 shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors',
                    index === active
                      ? 'bg-muted text-foreground'
                      : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                  )}
                  onClick={() => setActive(index)}
                >
                  {explicit[item.question].length > 0 && (
                    <HugeiconsIcon
                      icon={CheckmarkCircle02Icon}
                      aria-label="Answered"
                      className="text-success size-3.5"
                    />
                  )}
                  {explicit[item.question].length === 0 &&
                    answers[item.question] !== '' && (
                      <HugeiconsIcon
                        icon={CircleDashedIcon}
                        aria-label="Using the recommended answer"
                        className="text-primary size-3.5"
                      />
                    )}
                  {answers[item.question] === '' && (
                    <HugeiconsIcon
                      icon={HelpCircleIcon}
                      aria-label="Not answered"
                      className="text-muted-foreground size-3.5"
                    />
                  )}
                  {item.header}
                </button>
              ))}
            </div>
          )}
          <div className="ml-auto flex shrink-0 items-center gap-1.5 pr-1">
            {props.request.autoResolve !== undefined && (
              <span className="text-muted-foreground mr-1 text-xs tabular-nums">
                <Countdown
                  at={props.request.autoResolve.at}
                  label="Auto-submits"
                />
              </span>
            )}
            {active < questions.length - 1 && (
              <Button
                size="xs"
                variant="outline"
                onClick={() => setActive(active + 1)}
              >
                Skip
              </Button>
            )}
            {next !== undefined && (
              <Button
                size="xs"
                disabled={next === active}
                onClick={() => setActive(next)}
              >
                Next
              </Button>
            )}
            {next === undefined && (
              <Button
                size="xs"
                disabled={uploads > 0}
                onClick={() =>
                  respond(
                    props.request.id,
                    'allow',
                    Object.fromEntries(
                      Object.entries(answers).filter(([, value]) => value !== '')
                    )
                  )
                }
              >
                Submit
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
