import { Cancel01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useRef, useState } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import {
  applyStyle,
  builtinFonts,
  type Config,
  paletteNames,
  type Platform,
  platforms,
  saveConfig,
  type Shell,
  type ThemeColors,
} from '@/config'
import { restoreFocus } from '@/prompt-dialogs'
import { ColorInput, NumberInput, Swatch, TextInput } from '@/settings-inputs'
import { Row, Section } from '@/settings-layout'
import {
  BehaviorSection,
  IdentitySection,
  MacKeysSection,
  NotificationSection,
} from '@/settings-sections'
import { ShellInput } from '@/shell-input'
import { customTheme, getThemes, themeColors } from '@/themes'

const namedColors: {
  key: Exclude<keyof ThemeColors, 'palette'>
  label: string
}[] = [
  { key: 'background', label: 'Background' },
  { key: 'foreground', label: 'Foreground' },
  { key: 'cursor', label: 'Cursor' },
  { key: 'cursorText', label: 'Cursor text' },
  { key: 'selectionBackground', label: 'Selection background' },
  { key: 'selectionForeground', label: 'Selection foreground' },
]

export function SettingsDialog(props: {
  config: Config
  defaults: Config
  platform: Platform
  defaultShell: string
  onClose: () => void
}) {
  const [draft, setDraft] = useState(props.config)
  const [customFont, setCustomFont] = useState(
    !builtinFonts.some((font) => font.family === draft.font.family)
  )
  const [error, setError] = useState<string | null>(null)
  const [platform, setPlatform] = useState(props.platform)
  const shell = draft.shell[platform]
  const customColors =
    draft.theme.name === customTheme ? draft.theme.colors : undefined
  const timer = useRef<number | undefined>(undefined)
  const [confirming, setConfirming] = useState(false)
  const [revision, setRevision] = useState(0)

  function fail(failure: unknown) {
    setError(failure instanceof Error ? failure.message : String(failure))
  }

  function commit(next: Config) {
    setDraft(next)
    void applyStyle(next)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      saveConfig(next).then(() => setError(null), fail)
    }, 300)
  }

  function restoreDefaults() {
    setCustomFont(
      !builtinFonts.some((font) => font.family === props.defaults.font.family)
    )
    setRevision(revision + 1)
    commit(props.defaults)
  }

  function updateColors(value: Partial<ThemeColors>) {
    if (!draft.theme.colors) throw new Error('the custom theme has no colors')
    update('theme', { colors: { ...draft.theme.colors, ...value } })
  }

  function updateShell(value: Partial<Shell>) {
    commit({
      ...draft,
      shell: { ...draft.shell, [platform]: { ...shell, ...value } },
    })
  }

  function update<
    Key extends Exclude<keyof Config, 'scrollback' | 'emptyScreenAnimation'>,
  >(key: Key, value: Partial<Config[Key]>) {
    commit({ ...draft, [key]: { ...draft[key], ...value } })
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) props.onClose()
      }}
    >
      <DialogContent
        showCloseButton={false}
        aria-describedby={undefined}
        onCloseAutoFocus={restoreFocus}
        className="block max-h-[calc(100dvh-2rem)] overflow-auto px-6 pt-4 pb-7 sm:max-w-172"
      >
        <div key={revision} className="w-full space-y-5">
          <div className="mb-6 flex h-9 min-w-0 items-center gap-3">
            <DialogTitle className="shrink-0 text-xl font-semibold tracking-tight">
              Settings
            </DialogTitle>
            <p className="text-muted-foreground min-w-0 truncate text-sm">
              ~/.sshtty/config.json
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground ml-auto"
              onClick={() => setConfirming(true)}
            >
              Restore defaults
            </Button>
            <DialogClose asChild>
              <Button
                variant="ghost"
                size="icon"
                className="-mr-2"
                aria-label="Close settings"
              >
                <HugeiconsIcon icon={Cancel01Icon} />
              </Button>
            </DialogClose>
          </div>
          {error && (
            <p className="text-destructive text-sm whitespace-pre-wrap">
              Not saved: {error}
            </p>
          )}
          <Section title="Shell" note="Applies to new terminals">
            <Row label="Platform">
              <Select
                value={platform}
                onValueChange={(value: Platform) => setPlatform(value)}
              >
                <SelectTrigger className="w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {platforms.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                      {item.value === props.platform && (
                        <span className="text-muted-foreground">
                          (this device)
                        </span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Row>
            <Row label="Command">
              <ShellInput
                key={`${platform}-command`}
                platform={platform}
                device={props.platform}
                value={shell.command}
                onCommit={(command) => updateShell({ command })}
              />
            </Row>
            <Row label="Working directory">
              <TextInput
                key={`${platform}-cwd`}
                value={shell.cwd}
                onCommit={(cwd) => updateShell({ cwd })}
              />
            </Row>
          </Section>
          <Section title="Font">
            <Row label="Family">
              <Select
                value={customFont ? 'custom' : draft.font.family}
                onValueChange={(family) => {
                  setCustomFont(family === 'custom')
                  if (family !== 'custom') update('font', { family })
                }}
              >
                <SelectTrigger className="w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {builtinFonts.map((font) => (
                    <SelectItem key={font.family} value={font.family}>
                      {font.label}
                    </SelectItem>
                  ))}
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </Row>
            {customFont && (
              <Row label="Custom family">
                <TextInput
                  placeholder="Installed font name"
                  value={draft.font.family}
                  onCommit={(family) => update('font', { family })}
                />
              </Row>
            )}
            <Row label="Size">
              <NumberInput
                value={draft.font.size}
                step={0.5}
                onCommit={(size) => update('font', { size })}
              />
            </Row>
            <Row label="Line height">
              <NumberInput
                value={draft.font.lineHeight}
                step={0.05}
                onCommit={(lineHeight) => update('font', { lineHeight })}
              />
            </Row>
            <Row label="Ligatures">
              <Switch
                checked={draft.font.ligatures}
                onCheckedChange={(ligatures) => update('font', { ligatures })}
              />
            </Row>
          </Section>
          <Section title="Cursor">
            <Row label="Style">
              <Select
                value={draft.cursor.style}
                onValueChange={(style: Config['cursor']['style']) =>
                  update('cursor', { style })
                }
              >
                <SelectTrigger className="w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="block">Block</SelectItem>
                  <SelectItem value="bar">Bar</SelectItem>
                  <SelectItem value="underline">Underline</SelectItem>
                </SelectContent>
              </Select>
            </Row>
            <Row label="Blink">
              <Switch
                checked={draft.cursor.blink}
                onCheckedChange={(blink) => update('cursor', { blink })}
              />
            </Row>
          </Section>
          <BehaviorSection
            behavior={draft.behavior}
            platform={props.platform}
            shellCommand={draft.shell[props.platform].command}
            defaultShell={props.defaultShell}
            onChange={(value) => update('behavior', value)}
          />
          <MacKeysSection
            behavior={draft.behavior}
            onChange={(value) => update('behavior', value)}
          />
          <NotificationSection
            behavior={draft.behavior}
            onChange={(value) => update('behavior', value)}
          />
          <IdentitySection
            behavior={draft.behavior}
            onChange={(value) => update('behavior', value)}
          />
          <Section title="Layout">
            {(['top', 'right', 'bottom', 'left'] as const).map((side) => (
              <Row key={side} label={`Padding ${side}`}>
                <NumberInput
                  value={draft.padding[side]}
                  onCommit={(value) => update('padding', { [side]: value })}
                />
              </Row>
            ))}
            <Row label="Scrollback lines">
              <NumberInput
                value={draft.scrollback}
                step={1000}
                onCommit={(scrollback) => commit({ ...draft, scrollback })}
              />
            </Row>
          </Section>
          <Section title="Theme">
            <Row label="Theme">
              <Select
                value={draft.theme.name}
                onValueChange={(name) =>
                  update('theme', {
                    name,
                    colors:
                      name === customTheme
                        ? (draft.theme.colors ?? themeColors(draft.theme))
                        : draft.theme.colors,
                  })
                }
              >
                <SelectTrigger className="w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {getThemes().map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name}
                    </SelectItem>
                  ))}
                  <SelectItem value={customTheme}>Custom</SelectItem>
                </SelectContent>
              </Select>
            </Row>
            <Row label="Bold text in bright colors">
              <Switch
                checked={draft.theme.boldIsBright}
                onCheckedChange={(boldIsBright) =>
                  update('theme', { boldIsBright })
                }
              />
            </Row>
            <Row label="Animate the empty screen">
              <Switch
                checked={draft.emptyScreenAnimation}
                onCheckedChange={(emptyScreenAnimation) =>
                  commit({ ...draft, emptyScreenAnimation })
                }
              />
            </Row>
          </Section>
          {customColors && (
            <>
              <Section title="Custom colors">
                {namedColors.map((color) => (
                  <Row key={color.key} label={color.label}>
                    <ColorInput
                      label={color.label}
                      value={customColors[color.key]}
                      onCommit={(value) => updateColors({ [color.key]: value })}
                    />
                  </Row>
                ))}
              </Section>
              <Section title="Custom palette">
                {(['Normal', 'Bright'] as const).map((row, rowIndex) => (
                  <Row key={row} label={row}>
                    <div className="flex gap-1.5">
                      {customColors.palette
                        .slice(rowIndex * 8, rowIndex * 8 + 8)
                        .map((value, offset) => {
                          const index = rowIndex * 8 + offset
                          return (
                            <Swatch
                              key={paletteNames[index]}
                              label={paletteNames[index]}
                              value={value}
                              onChange={(next) =>
                                updateColors({
                                  palette: customColors.palette.map(
                                    (item, position) =>
                                      position === index ? next : item
                                  ),
                                })
                              }
                            />
                          )
                        })}
                    </div>
                  </Row>
                ))}
              </Section>
            </>
          )}
        </div>
        <AlertDialog open={confirming} onOpenChange={setConfirming}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Restore defaults?</AlertDialogTitle>
              <AlertDialogDescription>
                Every setting, including the shell for all platforms, goes back
                to its default.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={restoreDefaults}
              >
                Restore defaults
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  )
}
