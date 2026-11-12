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

export function ServiceButton(props: { machine: string }) {
  const machine = useStore((state) =>
    state.machines.find((item) => item.id === props.machine)
  )
  const service = machine?.status === 'online' ? machine.service : null
  const [open, setOpen] = useState(false)
  const [checking, setChecking] = useState(false)
  if (service === null) {
    return null
  }

  async function check() {
    setChecking(true)
    try {
      const result = await call(props.machine, 'service.check', undefined)
      if (!result.newer) {
        toast('OffSite is up to date')
      }
    } catch (failure) {
      toast.error(errorMessage(failure))
    }
    setChecking(false)
  }

  return (
    <>
      {service.installed && service.update === null ? (
        <Button
          variant="outline"
          size="sm"
          className="flex-none sm:w-full"
          disabled={checking}
          onClick={() => void check()}
        >
          {checking ? 'Checking…' : 'Check for updates'}
        </Button>
      ) : (
        <Button
          variant="outline"
          size="sm"
          className="flex-none sm:w-full"
          onClick={() => setOpen(true)}
        >
          {service.installed
            ? `Update to ${service.update}`
            : 'Install OffSite'}
        </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          aria-describedby={undefined}
          className="gap-0 overflow-hidden p-0 sm:max-w-md"
        >
          <ServiceEditor
            machine={props.machine}
            update={service.installed}
            onClose={() => setOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  )
}

export function ServiceSection(props: { machine: string }) {
  const installed = useStore(
    (state) =>
      state.machines.find((item) => item.id === props.machine)?.service
        ?.installed === true
  )
  const [open, setOpen] = useState(false)
  if (!installed) {
    return null
  }

  return (
    <Section title="Service">
      <Row label="OffSite service">
        <Button size="xs" variant="outline" onClick={() => setOpen(true)}>
          Edit
        </Button>
      </Row>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          aria-describedby={undefined}
          className="gap-0 overflow-hidden p-0 sm:max-w-md"
        >
          <ServiceEditor
            machine={props.machine}
            update={false}
            onClose={() => setOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </Section>
  )
}

function ServiceEditor(props: {
  machine: string
  update: boolean
  onClose: () => void
}) {
  const machine = useStore((state) =>
    state.machines.find((item) => item.id === props.machine)
  )

  return (
    <>
      <DialogHeader className="px-6 pt-4 pr-12">
        <DialogTitle className="text-base">
          {props.update
            ? `Update OffSite - ${machine?.name}`
            : machine?.service?.installed
              ? `OffSite - ${machine.name}`
              : `Install OffSite - ${machine?.name}`}
        </DialogTitle>
      </DialogHeader>
      <div className="px-6 pt-4 pb-6">
        <ServiceForm
          machine={props.machine}
          update={props.update}
          onDone={props.onClose}
          onCancel={props.onClose}
        />
      </div>
    </>
  )
}
