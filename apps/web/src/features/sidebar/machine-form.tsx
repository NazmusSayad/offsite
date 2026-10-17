import { type ReactNode, useState } from 'react'
import { addMachine, readMachineLink } from '@/api/machines'
import { Input } from '@/components/ui/input'
import { cn, errorMessage } from '@/lib/utils'

export function MachineForm(props: {
  fieldsClassName?: string
  onAdded?: () => void
  actions: (ready: boolean) => ReactNode
}) {
  const [manual, setManual] = useState(false)
  const [link, setLink] = useState('')
  const [address, setAddress] = useState('')
  const [token, setToken] = useState('')
  const [error, setError] = useState<string | null>(null)

  return (
    <form
      className="grid"
      onSubmit={(event) => {
        event.preventDefault()
        setError(null)
        try {
          if (manual)
            addMachine(
              readMachineLink(address).address,
              null,
              token.trim() === '' ? null : token.trim()
            )
          else {
            const read = readMachineLink(link)
            addMachine(read.address, read.fallback, read.token)
          }
          props.onAdded?.()
        } catch (failure) {
          setError(errorMessage(failure))
        }
      }}
    >
      <div className={cn('grid gap-2', props.fieldsClassName)}>
        {manual ? (
          <>
            <Input
              aria-label="Server URL"
              placeholder="Server URL, e.g. http://127.0.0.1:47841"
              spellCheck={false}
              autoComplete="off"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
            />
            <Input
              aria-label="Pairing token"
              placeholder="Pairing token, empty if auth is off"
              spellCheck={false}
              autoComplete="off"
              value={token}
              onChange={(event) => setToken(event.target.value)}
            />
          </>
        ) : (
          <Input
            aria-label="Pairing link"
            placeholder="Pairing link"
            spellCheck={false}
            autoComplete="off"
            value={link}
            onChange={(event) => setLink(event.target.value)}
          />
        )}
        {error !== null && (
          <p className="text-destructive text-sm break-all">{error}</p>
        )}
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground w-fit cursor-pointer text-xs"
          onClick={() => {
            setManual(!manual)
            setError(null)
          }}
        >
          {manual
            ? 'Paste a pairing link instead'
            : 'Enter the server URL and token separately'}
        </button>
      </div>
      {props.actions(manual ? address.trim() !== '' : link.trim() !== '')}
    </form>
  )
}
