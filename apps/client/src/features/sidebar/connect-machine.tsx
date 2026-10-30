import { Button } from '@/components/ui/button'
import { MachineForm } from './machine-form'

export function ConnectMachine() {
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
        <p className="text-muted-foreground mt-8 mb-3 text-sm">
          Or connect it here.
        </p>
        <MachineForm
          actions={(ready) => (
            <Button type="submit" className="mt-4" disabled={!ready}>
              Connect
            </Button>
          )}
        />
      </div>
    </div>
  )
}
