import ghosttyWasmUrl from './ghostty-vt.wasm?url'

type WasmFunction = (...args: Array<number | bigint>) => number

type TypeField = { offset: number; size: number; type: string }
type TypeLayout = {
  size: number
  align: number
  fields: Record<string, TypeField>
}

export type SizeReport = {
  rows: number
  columns: number
  cellWidth: number
  cellHeight: number
}

export type TerminalHost = {
  write: (data: string) => void
  size: () => SizeReport
}

const CALLBACKS_WASM = new Uint8Array([
  0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x01, 0x0f, 0x02, 0x60, 0x04,
  0x7f, 0x7f, 0x7f, 0x7f, 0x00, 0x60, 0x03, 0x7f, 0x7f, 0x7f, 0x01, 0x7f, 0x02,
  0x19, 0x03, 0x03, 0x65, 0x6e, 0x76, 0x01, 0x77, 0x00, 0x00, 0x03, 0x65, 0x6e,
  0x76, 0x01, 0x64, 0x00, 0x01, 0x03, 0x65, 0x6e, 0x76, 0x01, 0x73, 0x00, 0x01,
  0x07, 0x0d, 0x03, 0x01, 0x77, 0x00, 0x00, 0x01, 0x64, 0x00, 0x01, 0x01, 0x73,
  0x00, 0x02,
])

const OPTION = {
  userdata: 0,
  writePty: 1,
  size: 6,
  deviceAttributes: 8,
} as const

const decoder = new TextDecoder()

export class GhosttyRuntime {
  readonly memory: WebAssembly.Memory
  private readonly layouts: Record<string, TypeLayout>
  private readonly exports: WebAssembly.Exports
  private memoryView: DataView
  private readonly hosts = new Map<number, TerminalHost>()
  private nextHostId = 1
  private callbacks = { writePty: 0, deviceAttributes: 0, size: 0 }

  private constructor(instance: WebAssembly.Instance) {
    this.exports = instance.exports
    const memory = instance.exports.memory
    if (!(memory instanceof WebAssembly.Memory))
      throw new Error('libghostty-vt did not export its memory')
    this.memory = memory
    this.memoryView = new DataView(memory.buffer)
    const pointer = this.call('ghostty_type_json')
    const bytes = new Uint8Array(memory.buffer)
    let end = pointer
    while (end < bytes.length && bytes[end] !== 0) end += 1
    this.layouts = JSON.parse(decoder.decode(bytes.subarray(pointer, end)))
  }

  static async load() {
    const response = await fetch(ghosttyWasmUrl)
    if (!response.ok)
      throw new Error(`could not load libghostty-vt (${response.status})`)
    let memory: WebAssembly.Memory | null = null
    const result = await WebAssembly.instantiate(await response.arrayBuffer(), {
      env: {
        log: (pointer: number, length: number) => {
          if (!memory) return
          console.debug(
            '[libghostty-vt]',
            decoder.decode(new Uint8Array(memory.buffer, pointer, length))
          )
        },
      },
    })
    const runtime = new GhosttyRuntime(result.instance)
    memory = runtime.memory
    runtime.installCallbacks()
    return runtime
  }

  call(name: string, ...args: Array<number | bigint>) {
    const fn = this.exports[name]
    if (typeof fn !== 'function')
      throw new Error(`libghostty-vt export is missing: ${name}`)
    return (fn as WasmFunction)(...args)
  }

  layout(name: string) {
    const layout = this.layouts[name]
    if (!layout) throw new Error(`libghostty-vt layout is missing: ${name}`)
    return layout
  }

  field(structName: string, fieldName: string) {
    const field = this.layout(structName).fields[fieldName]
    if (!field)
      throw new Error(
        `libghostty-vt field is missing: ${structName}.${fieldName}`
      )
    return field
  }

  alloc(size: number) {
    const pointer = this.call('ghostty_wasm_alloc_u8_array', size)
    if (pointer === 0)
      throw new Error(`libghostty-vt could not allocate ${size} bytes`)
    new Uint8Array(this.memory.buffer, pointer, size).fill(0)
    return pointer
  }

  free(pointer: number, size: number) {
    if (pointer !== 0) this.call('ghostty_wasm_free_u8_array', pointer, size)
  }

  allocOpaque() {
    const pointer = this.call('ghostty_wasm_alloc_opaque')
    if (pointer === 0)
      throw new Error('libghostty-vt could not allocate a pointer')
    new DataView(this.memory.buffer).setUint32(pointer, 0, true)
    return pointer
  }

  freeOpaque(pointer: number) {
    if (pointer !== 0) this.call('ghostty_wasm_free_opaque', pointer)
  }

  readPointer(slot: number) {
    return this.dataView().getUint32(slot, true)
  }

  attachHost(terminal: number, host: TerminalHost) {
    const id = this.nextHostId++
    this.hosts.set(id, host)
    this.call('ghostty_terminal_set', terminal, OPTION.userdata, id)
    this.call(
      'ghostty_terminal_set',
      terminal,
      OPTION.writePty,
      this.callbacks.writePty
    )
    this.call(
      'ghostty_terminal_set',
      terminal,
      OPTION.deviceAttributes,
      this.callbacks.deviceAttributes
    )
    this.call(
      'ghostty_terminal_set',
      terminal,
      OPTION.size,
      this.callbacks.size
    )
    return id
  }

  detachHost(terminal: number, id: number) {
    this.call('ghostty_terminal_set', terminal, OPTION.size, 0)
    this.call('ghostty_terminal_set', terminal, OPTION.deviceAttributes, 0)
    this.call('ghostty_terminal_set', terminal, OPTION.writePty, 0)
    this.call('ghostty_terminal_set', terminal, OPTION.userdata, 0)
    this.hosts.delete(id)
  }

  view(pointer: number, size: number) {
    return new DataView(this.memory.buffer, pointer, size)
  }

  bytes(pointer: number, size: number) {
    return new Uint8Array(this.memory.buffer, pointer, size)
  }

  dataView() {
    if (this.memoryView.buffer !== this.memory.buffer)
      this.memoryView = new DataView(this.memory.buffer)
    return this.memoryView
  }

  setField(
    pointer: number,
    structName: string,
    fieldName: string,
    value: number
  ) {
    const field = this.field(structName, fieldName)
    const view = this.dataView()
    const offset = pointer + field.offset
    if (field.type === 'bool' || field.type === 'u8') {
      view.setUint8(offset, value)
      return
    }
    if (field.type === 'u16') {
      view.setUint16(offset, value, true)
      return
    }
    if (field.type === 'i32') {
      view.setInt32(offset, value, true)
      return
    }
    if (field.type === 'u32' || field.type === 'enum') {
      view.setUint32(offset, value, true)
      return
    }
    if (field.type === 'u64') {
      view.setBigUint64(offset, BigInt(value), true)
      return
    }
    throw new Error(`unsupported libghostty-vt field type ${field.type}`)
  }

  readField(pointer: number, structName: string, fieldName: string) {
    const field = this.field(structName, fieldName)
    const view = this.dataView()
    const offset = pointer + field.offset
    if (field.type === 'bool' || field.type === 'u8')
      return view.getUint8(offset)
    if (field.type === 'u16') return view.getUint16(offset, true)
    if (field.type === 'i32') return view.getInt32(offset, true)
    if (field.type === 'u32' || field.type === 'enum')
      return view.getUint32(offset, true)
    if (field.type === 'u64') return Number(view.getBigUint64(offset, true))
    throw new Error(`unsupported libghostty-vt field type ${field.type}`)
  }

  private installCallbacks() {
    const instance = new WebAssembly.Instance(
      new WebAssembly.Module(CALLBACKS_WASM),
      {
        env: {
          w: (
            _terminal: number,
            userdata: number,
            pointer: number,
            length: number
          ) => {
            const host = this.hosts.get(userdata)
            if (!host || length === 0) return
            host.write(
              decoder.decode(
                new Uint8Array(this.memory.buffer, pointer, length)
              )
            )
          },
          d: (_terminal: number, userdata: number, pointer: number) => {
            if (!this.hosts.has(userdata)) return 0
            this.writeDeviceAttributes(pointer)
            return 1
          },
          s: (_terminal: number, userdata: number, pointer: number) => {
            const host = this.hosts.get(userdata)
            if (!host) return 0
            const size = host.size()
            const name = 'GhosttySizeReportSize'
            this.setField(pointer, name, 'rows', size.rows)
            this.setField(pointer, name, 'columns', size.columns)
            this.setField(pointer, name, 'cell_width', size.cellWidth)
            this.setField(pointer, name, 'cell_height', size.cellHeight)
            return 1
          },
        },
      }
    )
    const table = this.exports.__indirect_function_table
    if (!(table instanceof WebAssembly.Table))
      throw new Error('libghostty-vt did not expose its callback table')
    const [writePty, deviceAttributes, size] = ['w', 'd', 's'].map((name) => {
      const callback = instance.exports[name]
      if (typeof callback !== 'function')
        throw new Error(`libghostty-vt callback is missing: ${name}`)
      const index = table.length
      table.grow(1)
      table.set(index, callback)
      return index
    })
    this.callbacks = { writePty, deviceAttributes, size }
  }

  private writeDeviceAttributes(pointer: number) {
    const primary =
      pointer + this.field('GhosttyDeviceAttributes', 'primary').offset
    const secondary =
      pointer + this.field('GhosttyDeviceAttributes', 'secondary').offset
    const tertiary =
      pointer + this.field('GhosttyDeviceAttributes', 'tertiary').offset
    const features =
      primary + this.field('GhosttyDeviceAttributesPrimary', 'features').offset
    const view = this.dataView()
    const supported = [4, 22]
    supported.forEach((feature, index) =>
      view.setUint16(features + index * 2, feature, true)
    )
    this.setField(
      primary,
      'GhosttyDeviceAttributesPrimary',
      'conformance_level',
      62
    )
    this.setField(
      primary,
      'GhosttyDeviceAttributesPrimary',
      'num_features',
      supported.length
    )
    this.setField(
      secondary,
      'GhosttyDeviceAttributesSecondary',
      'device_type',
      0
    )
    this.setField(
      secondary,
      'GhosttyDeviceAttributesSecondary',
      'firmware_version',
      276
    )
    this.setField(
      secondary,
      'GhosttyDeviceAttributesSecondary',
      'rom_cartridge',
      0
    )
    this.setField(tertiary, 'GhosttyDeviceAttributesTertiary', 'unit_id', 0)
  }
}

let runtime: GhosttyRuntime | null = null

export async function loadGhostty() {
  runtime = await GhosttyRuntime.load()
}

export function ghostty() {
  if (!runtime) throw new Error('libghostty-vt is not loaded')
  return runtime
}
