import { lazy, Suspense, useSyncExternalStore } from 'react'
import { useHotkeys } from 'react-hotkeys-hook'
import { useHotkeyHints } from '@/components/hotkey-hint'
import { Toaster } from '@/components/ui/sonner'
import { SettingsDialog } from '@/features/settings/dialog'
import { MobileSettings } from '@/features/settings/mobile'
import { PairingFailedDialog } from '@/features/settings/pairing-failed-dialog'
import { ExportDialog } from '@/features/sidebar/export-dialog'
import { Palette } from '@/features/sidebar/palette'
import { MoveDialogs } from '@/features/sidebar/worktree-dialogs'
import { TerminalPalette } from '@/features/terminal/terminal-palette'
import { DesktopLayout } from '@/features/workspace/desktop'
import { MobileLayout } from '@/features/workspace/mobile'
import { useAttentionBadge } from '@/lib/notifications'
import { getState, showEditor, showPalette, useStore } from '@/lib/store'
import { wide } from '@/lib/utils'

const EditorDialog = lazy(async () => ({
  default: (await import('@/features/files/editor-dialog')).EditorDialog,
}))

const paletteKeys = ['mod+k', 'mod+shift+p']

function subscribeWide(listener: () => void) {
  wide.addEventListener('change', listener)
  return () => wide.removeEventListener('change', listener)
}

export function App() {
  const desktop = useSyncExternalStore(subscribeWide, () => wide.matches)
  const editor = useStore((state) => state.editor)
  const exporting = useStore((state) => state.exporting)
  useAttentionBadge()
  useHotkeyHints()
  useHotkeys(paletteKeys, () => showPalette(!getState().paletteOpen), {
    enableOnFormTags: true,
    enableOnContentEditable: true,
    preventDefault: true,
  })

  return (
    <div className="flex h-dvh text-sm">
      {desktop ? <DesktopLayout /> : <MobileLayout />}
      <Palette />
      <TerminalPalette />
      {desktop ? <SettingsDialog /> : <MobileSettings />}
      {editor !== null && (
        <Suspense>
          <EditorDialog
            machine={editor.machine}
            projectId={editor.projectId}
            onClose={() => showEditor(null)}
          />
        </Suspense>
      )}
      {exporting !== null && <ExportDialog session={exporting} />}
      <MoveDialogs />
      <PairingFailedDialog />
      <Toaster
        position={desktop ? 'bottom-right' : 'top-center'}
        swipeDirections={
          desktop ? ['right', 'bottom'] : ['left', 'right', 'top']
        }
      />
    </div>
  )
}
