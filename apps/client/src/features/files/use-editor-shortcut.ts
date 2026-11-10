import { useHotkeys } from 'react-hotkeys-hook'

export function useEditorShortcut(onToggle: () => void, enabled: boolean) {
  useHotkeys(
    ['mod+e', 'mod+j'],
    (event) => {
      event.stopPropagation()
      onToggle()
    },
    {
      enabled,
      enableOnFormTags: true,
      preventDefault: true,
      eventListenerOptions: { capture: true },
    }
  )
}
