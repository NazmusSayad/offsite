import {
  ArrowTurnBackwardIcon,
  ComputerTerminal01Icon,
  Folder01Icon,
  GitPullRequestIcon,
  GlobalIcon,
  Task01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import Image from 'next/image'

export function Desk() {
  return (
    <section className="px-6 py-24 md:py-32">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="reveal text-4xl leading-[1.05] font-medium tracking-[-0.035em] text-balance md:text-[3.5rem]">
            The whole desk, in one tab.
          </h2>
          <p className="reveal text-muted mt-5 text-lg leading-relaxed text-balance [--delay:100ms]">
            Everything you would otherwise switch windows for sits next to the
            chat.
          </p>
        </div>

        <div className="mt-14 grid gap-x-5 gap-y-10 md:mt-20 md:grid-cols-3">
          <article className="reveal">
            <div className="mesh-amber grain relative aspect-[4/3] overflow-hidden rounded-3xl">
              <Image
                src="/app-terminal-panel.webp"
                width={2368}
                height={920}
                sizes="(min-width: 768px) 640px, 170vw"
                alt="A terminal panel under the composer, showing git log output"
                className="absolute top-[22%] left-[10%] w-[170%] max-w-none rounded-tl-xl shadow-2xl ring-1 ring-black/15"
              />
            </div>
            <CardText
              icon={ComputerTerminal01Icon}
              title="A real terminal"
              text="Ghostty, compiled to WebAssembly. Tabs, find, clickable links and inline images, with the font and theme you pick."
            />
          </article>
          <article className="reveal [--delay:80ms]">
            <div className="mesh-blue grain grid aspect-[4/3] place-items-center overflow-hidden rounded-3xl px-6">
              <Image
                src="/app-gitbar.webp"
                width={840}
                height={104}
                sizes="(min-width: 768px) 340px, 90vw"
                alt="The toolbar with the current branch, a Commit button and panel toggles"
                className="w-full rounded-xl shadow-2xl ring-1 ring-black/15"
              />
            </div>
            <CardText
              icon={GitPullRequestIcon}
              title="Git"
              text="Diffs, branches, push, and pull requests. Commit messages are written by the model you choose."
            />
          </article>
          <article className="reveal [--delay:160ms]">
            <div className="mesh-green grain relative aspect-[4/3] overflow-hidden rounded-3xl">
              <Image
                src="/app-composer.webp"
                width={1508}
                height={302}
                sizes="(min-width: 768px) 420px, 100vw"
                alt="The composer, which takes @ for files and / for commands"
                className="absolute top-1/2 left-[10%] w-[115%] max-w-none -translate-y-1/2 rounded-l-xl shadow-2xl ring-1 ring-black/15"
              />
            </div>
            <CardText
              icon={Folder01Icon}
              title="Files"
              text="Browse the project, preview and download any file. Type @ to put one in front of the agent."
            />
          </article>
        </div>

        <ul className="reveal border-line mt-16 grid gap-8 border-t pt-10 md:grid-cols-3 md:gap-5">
          <Extra
            icon={GlobalIcon}
            title="Browser"
            text="Open your dev server or any file in a panel beside the chat. It goes through your machine, so localhost just works."
          />
          <Extra
            icon={ArrowTurnBackwardIcon}
            title="Rewind and fork"
            text="Restore the code, the chat or both to any earlier message, or fork a new thread from any reply."
          />
          <Extra
            icon={Task01Icon}
            title="Plans and questions"
            text="Approve plans and answer the agent in the thread, or put them on a timer so a question never stalls a task."
          />
        </ul>
      </div>
    </section>
  )
}

function CardText(props: {
  icon: typeof GlobalIcon
  title: string
  text: string
}) {
  return (
    <div className="mt-5 px-1">
      <h3 className="flex items-center gap-2.5 font-medium">
        <HugeiconsIcon icon={props.icon} className="text-accent size-5" />
        {props.title}
      </h3>
      <p className="text-muted mt-2 leading-relaxed">{props.text}</p>
    </div>
  )
}

function Extra(props: {
  icon: typeof GlobalIcon
  title: string
  text: string
}) {
  return (
    <li className="flex gap-4">
      <HugeiconsIcon icon={props.icon} className="mt-0.5 size-5 shrink-0" />
      <p className="text-muted leading-relaxed">
        <span className="text-foreground font-medium">{props.title}.</span>{' '}
        {props.text}
      </p>
    </li>
  )
}
