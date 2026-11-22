import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export default {
  id: 'offsite',
  async setup(context) {
    const path = fileURLToPath(
      new URL('../skills/chat/SKILL.md', import.meta.url)
    )
    const match =
      /^---\r?\nname: .+\r?\ndescription: (.+)\r?\n---\r?\n([\s\S]*)$/.exec(
        readFileSync(path, 'utf8')
      )
    if (match === null) {
      throw new Error(`${path} must have only a name and a description`)
    }
    await context.skill.transform((skills) =>
      skills.add({
        id: 'offsite:chat',
        name: 'offsite:chat',
        description: match[1],
        path,
        content: match[2],
      })
    )
  },
}
