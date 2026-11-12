import { useState } from 'react'
import { toast } from 'sonner'
import { call } from '@/api/connection'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ServiceForm } from '@/features/service/service-form'
import { useStore } from '@/lib/store'
import { errorMessage } from '@/lib/utils'
import { Row, Section } from './controls'

export function ServiceSection(props: { machine: string }) {
  const installed = useStore(
    (state) =>
      state.machines.find((item) => item.id === props.machine)?.service
        ?.installed ?? null
  )
  const [open, setOpen] = useState(false)
  const [checking, setChecking] = useState(false)
  if (installed === null) {
    return null
  }

  return (
    <Section title="Service">
      <Row label="OffSite service">
        <div className="flex items-center gap-2">
          <Button
            size="xs"
            variant="outline"
            disabled={checking}
            onClick={async () => {
              setChecking(true)
              try {
                const result = await call(
                  props.machine,
                  'service.check',
                  undefined
                )
                toast(
                  result.newer
                    ? `OffSite ${result.latest} is available`
                    : 'OffSite is up to date'
                )
              } catch (failure) {
                toast.error(errorMessage(failure))
              }
              setChecking(false)
            }}
          >
            {checking ? 'Checking…' : 'Check for updates'}
          </Button>
          <Button size="xs" variant="outline" onClick={() => setOpen(true)}>
            {installed ? 'Edit' : 'Install'}
          </Button>
        </div>
      </Row>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          aria-describedby={undefined}
          className="gap-0 overflow-hidden p-0 sm:max-w-md"
        >
          <ServiceEditor
            machine={props.machine}
            onClose={() => setOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </Section>
  )
}

function ServiceEditor(props: { machine: string; onClose: () => void }) {
  const machine = useStore((state) =>
    state.machines.find((item) => item.id === props.machine)
  )

  return (
    <>
      <DialogHeader className="px-6 pt-4 pr-12">
        <DialogTitle className="text-base">
          {machine?.service?.installed
            ? `OffSite - ${machine.name}`
            : `Install OffSite - ${machine?.name}`}
        </DialogTitle>
      </DialogHeader>
      <div className="px-6 pt-4 pb-6">
        <ServiceForm
          machine={props.machine}
          update={false}
          onDone={props.onClose}
          onCancel={props.onClose}
        />
      </div>
    </>
  )
}
