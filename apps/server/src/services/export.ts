import type { Item, ItemStatus } from '@offsite/core/items'
import type { Session } from '@offsite/core/sessions'
import { earlier } from '../lib/claude/index.ts'
import { providerName } from './accounts.ts'
import { projectPath } from './projects.ts'
import { sessionHistory } from './runs.ts'
import { findSession } from './sessions.ts'

export async function exportSession(sessionId: string, projectId: string) {
  const [session, event] = await Promise.all([
    findSession(sessionId),
    sessionHistory(sessionId, projectPath(projectId)),
  ])
  if (session === null) {
    throw new Error(`session ${sessionId} not found`)
  }
  if (event.type !== 'history') {
    throw new Error(`unexpected ${event.type} event for ${sessionId}`)
  }
  let items = event.items
  let before = event.before
  while (before !== null) {
    const page = await earlier(sessionId, before)
    items = [...page.items, ...items]
    before = page.before
  }
  return {
    markdown: {
      messages: markdown(session, items, 0),
      steps: markdown(session, items, 1),
      details: markdown(session, items, 2),
      full: markdown(session, items, 3),
    },
    context: event.context,
  }
}

function markdown(session: Session, items: Item[], level: number) {
  const sections: string[] = []
  let assistant: string[] = []
  for (const item of items) {
    if (item.parent !== null) {
      continue
    }
    if (item.kind === 'user') {
      if (assistant.length > 0) {
        sections.push(`## Assistant\n\n${assistant.join('\n\n')}`)
        assistant = []
      }
      sections.push(`## User\n\n${userText(item)}`)
      continue
    }
    const text = itemText(item, level)
    if (text !== null) {
      assistant.push(text)
    }
  }
  if (assistant.length > 0) {
    sections.push(`## Assistant\n\n${assistant.join('\n\n')}`)
  }
  const header = [
    `# ${session.title}`,
    '',
    `**Session ID:** ${session.id}`,
    `**Provider:** ${providerName(session.provider)}`,
    ...(session.branch === null ? [] : [`**Branch:** ${session.branch}`]),
    `**Updated:** ${new Date(session.updatedAt).toLocaleString()}`,
  ].join('\n')
  return `${[header, ...sections].join('\n\n---\n\n')}\n`
}

function userText(item: Extract<Item, { kind: 'user' }>) {
  const images =
    item.images.length === 0
      ? ''
      : `\n\n_[${item.images.length} image${item.images.length === 1 ? '' : 's'} attached]_`
  switch (item.format) {
    case 'text':
      return `${item.text}${images}`
    case 'command':
    case 'output':
      return `${fenced('', item.text)}${images}`
  }
}

function itemText(item: Exclude<Item, { kind: 'user' }>, level: number) {
  switch (item.kind) {
    case 'assistant':
      return item.text
    case 'plan':
      return `**Plan:**\n\n${item.plan}`
    case 'question':
      return item.questions
        .map(
          (question) =>
            `**Question:** ${question.question}\n\n**Answer:** ${item.answers?.[question.question] ?? '_No answer_'}`
        )
        .join('\n\n')
    case 'error':
      return `**Error:** ${item.text}`
    case 'reasoning':
      return level < 2 ? null : `_Thinking:_\n\n${item.text}`
    case 'command': {
      if (level < 1) {
        return null
      }
      if (level < 2) {
        return `**Shell:** ${item.description === '' ? `\`${item.command.split('\n')[0]}\`` : item.description}${statusText(item.status)}`
      }
      return `**Shell**${item.description === '' ? '' : `: ${item.description}`}${statusText(item.status)}\n\n${fenced('sh', `$ ${item.command}${level < 3 || item.output === '' ? '' : `\n${item.output}`}`)}`
    }
    case 'file_change': {
      if (level < 1) {
        return null
      }
      const title = `**Edit:** \`${item.path}\`${statusText(item.status)}`
      if (level < 2) {
        return title
      }
      return `${title}\n\n${fenced(
        'diff',
        item.diffs
          .map((diff) =>
            [
              ...lines(diff.before).map((line) => `-${line}`),
              ...lines(diff.after).map((line) => `+${line}`),
            ].join('\n')
          )
          .join('\n')
      )}${level < 3 || item.output === '' ? '' : `\n\n${fenced('', item.output)}`}`
    }
    case 'web_search': {
      if (level < 1) {
        return null
      }
      const title = `**Web search:** ${item.query ?? item.url ?? ''}${statusText(item.status)}`
      if (level < 2) {
        return title
      }
      return [
        title,
        ...item.results.map((result) => `- [${result.title}](${result.url})`),
      ].join('\n')
    }
    case 'skill': {
      if (level < 1) {
        return null
      }
      const title = `**Skill:** ${item.skill}${statusText(item.status)}`
      return level < 3 || item.output === ''
        ? title
        : `${title}\n\n${fenced('', item.output)}`
    }
    case 'tool': {
      if (level < 1) {
        return null
      }
      const title = `**Tool:** ${item.name}${statusText(item.status)}`
      if (level < 2) {
        return title
      }
      return `${title}\n\n**Input:**\n\n${fenced('json', JSON.stringify(item.input, null, 2))}${level < 3 || item.output === '' ? '' : `\n\n**Output:**\n\n${fenced('', item.output)}`}`
    }
    case 'subagent':
      return level < 1
        ? null
        : `**Subagent (${item.agent}):** ${item.description}${statusText(item.status)}`
    case 'agent_message':
      return level < 1
        ? null
        : `**Message${item.target === null ? '' : ` to ${item.target}`}:** ${item.summary}${statusText(item.status)}`
    case 'notice':
      return level < 1 ? null : `_${item.text}_`
    case 'compaction':
      if (level < 1) {
        return null
      }
      return level < 2 || item.summary === null
        ? '_Conversation compacted_'
        : `_Conversation compacted_\n\n${item.summary}`
    case 'todo_list':
      return level < 2
        ? null
        : [
            '**Todos:**',
            '',
            ...item.steps.map(
              (step) =>
                `- [${step.status === 'completed' ? 'x' : ' '}] ${step.text}`
            ),
          ].join('\n')
  }
}

function statusText(status: ItemStatus) {
  switch (status) {
    case 'completed':
      return ''
    case 'running':
      return ' _(running)_'
    case 'failed':
      return ' _(failed)_'
    case 'stopped':
      return ' _(stopped)_'
  }
}

function lines(text: string) {
  return text === '' ? [] : text.split('\n')
}

function fenced(language: string, text: string) {
  const longest = Math.max(
    0,
    ...(text.match(/`+/g) ?? []).map((run) => run.length)
  )
  const fence = '`'.repeat(Math.max(3, longest + 1))
  return `${fence}${language}\n${text}\n${fence}`
}
