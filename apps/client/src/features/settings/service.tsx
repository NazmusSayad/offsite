import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ServiceForm } from '@/features/service/service-form'
import { useStore } from '@/lib/store'
import { Row, Section } from './controls'

export function ServiceButton(props: { machine: string }) {
  const installed = useStore((state) => {
    const machine = state.machines.find((item) => item.id === props.machine)
    return machine?.status === 'online' ? machine.service?.installed : null
  })
  const [open, setOpen] = useState(false)
  if (installed !== false) {
    return null
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Install OffSite
      </Button>
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
      <div className="min-w-0 px-6 pt-4 pb-6">
        <ServiceForm
          machine={props.machine}
          onDone={props.onClose}
          onCancel={props.onClose}
        />
      </div>
    </>
  )
}
