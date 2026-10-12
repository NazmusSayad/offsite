import { TriangleAlertIcon } from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { CopyCommand } from './copy-command'

const options = [
  {
    flag: '--host <HOST>',
    fallback: '127.0.0.1',
    description: 'Address to listen on',
  },
  {
    flag: '--port <PORT>',
    fallback: '47831',
    description: 'Port to listen on',
  },
  {
    flag: '--dir <DIR>',
    fallback: '~/.sshtty',
    description: 'Folder for settings and groups',
  },
  {
    flag: '--debug',
    fallback: '',
    description: 'Write detailed logs and serve them at /api/debug/logs',
  },
]

export function Install() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-32">
      <div className="grid gap-16 lg:grid-cols-2">
        <div>
          <h2 className="text-4xl font-semibold tracking-tight sm:text-5xl">
            Run it with npx.
          </h2>
          <p className="text-muted-foreground mt-6 max-w-md text-lg">
            Then open{' '}
            <a
              href="http://127.0.0.1:47831"
              className="text-foreground decoration-primary font-mono underline underline-offset-4"
            >
              127.0.0.1:47831
            </a>{' '}
            in your browser.
          </p>
          <CopyCommand className="mt-10 h-16 px-7 text-xl" />
          <dl className="mt-12 grid grid-cols-3 gap-6 border-t pt-6 text-sm">
            <div>
              <dt className="text-muted-foreground">macOS</dt>
              <dd className="mt-1">Apple Silicon, Intel</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Linux</dt>
              <dd className="mt-1">x64, arm64</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Windows</dt>
              <dd className="mt-1">x64</dd>
            </div>
          </dl>
        </div>

        <div className="flex flex-col gap-8">
          <Table className="font-mono text-sm">
            <TableHeader>
              <TableRow>
                <TableHead>Option</TableHead>
                <TableHead>Default</TableHead>
                <TableHead className="font-sans">Description</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {options.map((option) => (
                <TableRow key={option.flag}>
                  <TableCell className="text-ansi-cyan">
                    {option.flag}
                  </TableCell>
                  <TableCell className="text-ansi-yellow">
                    {option.fallback}
                  </TableCell>
                  <TableCell className="text-muted-foreground font-sans whitespace-normal">
                    {option.description}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="border-destructive/30 bg-destructive/10 flex gap-4 rounded-xl border p-5">
            <TriangleAlertIcon className="text-destructive mt-0.5 size-5 shrink-0" />
            <p className="text-sm text-pretty">
              sshtty has no login. Anyone who can reach its port gets a shell on
              your machine. Keep the default 127.0.0.1, and only change --host
              on a network you trust.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
