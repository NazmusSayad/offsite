import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { ServiceDialog } from '@/features/service/service-dialog'
import { useStore } from '@/lib/store'
import { Row, Section } from './controls'

export function ServiceSection(props: { machine: string }) {
  const installed = useStore(
    (state) =>
      state.machines.find((item) => item.id === props.machine)?.service
        ?.installed ?? null
  )
  const [open, setOpen] = useState(false)
  if (installed === null) {
    return null
  }

  return (
    <Section title="Service">
      <Row label="offsite service">
        <Button size="xs" variant="outline" onClick={() => setOpen(true)}>
          {installed ? 'Edit' : 'Install'}
        </Button>
      </Row>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          aria-describedby={undefined}
          className="gap-0 overflow-hidden p-0 sm:max-w-md"
        >
          <ServiceDialog
            machine={props.machine}
            update={false}
            onClose={() => setOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </Section>
  )
}
