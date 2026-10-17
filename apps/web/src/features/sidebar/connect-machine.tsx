import { useState } from 'react'
import { addMachine } from '@/api/sync'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { errorMessage } from '@/lib/utils'

export function ConnectMachine() {
  const [link, setLink] = useState('')
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="grid flex-1 place-items-center p-6">
      <div className="w-full max-w-md">
        <h1 className="text-foreground text-center text-2xl font-normal tracking-tight sm:text-3xl">
          Connect a machine
        </h1>
        <p className="text-muted-foreground mt-2 text-center text-sm">
          Run this on the computer you want to use, then open the pairing link
          it prints.
        </p>
        <pre className="bg-muted text-foreground mt-5 rounded-lg px-4 py-3 font-mono text-sm select-all">
          npx offsite serve
        </pre>
        <form
          className="mt-8 grid gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            try {
              addMachine(link)
            } catch (failure) {
              setError(errorMessage(failure))
            }
          }}
        >
          <p className="text-muted-foreground text-sm">
            Or paste the pairing link here.
          </p>
          <div className="flex gap-2">
            <Input
              aria-label="Pairing link"
              placeholder="Pairing link or address"
              spellCheck={false}
              autoComplete="off"
              value={link}
              onChange={(event) => setLink(event.target.value)}
            />
            <Button type="submit" disabled={link.trim() === ''}>
              Connect
            </Button>
          </div>
          {error !== null && (
            <p className="text-destructive text-sm break-all">{error}</p>
          )}
        </form>
      </div>
    </div>
  )
}
