import ghosttyWasmUrl from './ghostty-vt.wasm?url'
import { decodePng } from './images'

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
  bell: () => void
  version: () => string
}

const CALLBACKS_WASM = new Uint8Array([
  0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x01, 0x23, 0x05, 0x60, 0x04,
  0x7f, 0x7f, 0x7f, 0x7f, 0x00, 0x60, 0x03, 0x7f, 0x7f, 0x7f, 0x01, 0x7f, 0x60,
  0x02, 0x7f, 0x7f, 0x00, 0x60, 0x03, 0x7f, 0x7f, 0x7f, 0x00, 0x60, 0x05, 0x7f,
  0x7f, 0x7f, 0x7f, 0x7f, 0x01, 0x7f, 0x02, 0x31, 0x06, 0x03, 0x65, 0x6e, 0x76,
  0x01, 0x77, 0x00, 0x00, 0x03, 0x65, 0x6e, 0x76, 0x01, 0x64, 0x00, 0x01, 0x03,
  0x65, 0x6e, 0x76, 0x01, 0x73, 0x00, 0x01, 0x03, 0x65, 0x6e, 0x76, 0x01, 0x62,
  0x00, 0x02, 0x03, 0x65, 0x6e, 0x76, 0x01, 0x76, 0x00, 0x03, 0x03, 0x65, 0x6e,
  0x76, 0x01, 0x70, 0x00, 0x04, 0x07, 0x19, 0x06, 0x01, 0x77, 0x00, 0x00, 0x01,
  0x64, 0x00, 0x01, 0x01, 0x73, 0x00, 0x02, 0x01, 0x62, 0x00, 0x03, 0x01, 0x76,
  0x00, 0x04, 0x01, 0x70, 0x00, 0x05,
])

const OPTION = {
  userdata: 0,
  writePty: 1,
  bell: 2,
  xtversion: 4,
  size: 6,
  deviceAttributes: 8,
} as const

const SYS_DECODE_PNG = 1
const OUT_OF_SPACE = -3
const SYS_IMAGE = { width: 0, height: 4, data: 8, length: 12 } as const

const decoder = new TextDecoder()
const encoder = new TextEncoder()

export const SUCCESS = 0

export class GhosttyRuntime {
  readonly memory: WebAssembly.Memory
  private readonly layouts: Record<string, TypeLayout>
  private readonly exports: WebAssembly.Exports
  private memoryView: DataView
  private readonly hosts = new Map<number, TerminalHost>()
  private nextHostId = 1
  private callbacks = {
    writePty: 0,
    deviceAttributes: 0,
    size: 0,
    bell: 0,
    xtversion: 0,
  }
  private version = { pointer: 0, size: 0 }

  private constructor(instance: WebAssembly.Instance) {
    this.exports = instance.exports
    const memory = instance.exports.memory
    if (!(memory instanceof WebAssembly.Memory)) {
      throw new Error('libghostty-vt did not export its memory')
    }
    this.memory = memory
    this.memoryView = new DataView(memory.buffer)
    const pointer = this.call('ghostty_type_json')
    const bytes = new Uint8Array(memory.buffer)
    let end = pointer
    while (end < bytes.length && bytes[end] !== 0) {
      end += 1
    }
    this.layouts = JSON.parse(decoder.decode(bytes.subarray(pointer, end)))
  }

  static async load() {
    const response = await fetch(ghosttyWasmUrl)
    if (!response.ok) {
      throw new Error(`could not load libghostty-vt (${response.status})`)
    }
    let memory: WebAssembly.Memory | null = null
    const result = await WebAssembly.instantiate(await response.arrayBuffer(), {
      env: {
        log: (pointer: number, length: number) => {
          if (!memory) {
            return
          }
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
    if (typeof fn !== 'function') {
      throw new Error(`libghostty-vt export is missing: ${name}`)
    }
    return (fn as WasmFunction)(...args)
  }

  layout(name: string) {
    const layout = this.layouts[name]
    if (!layout) {
      throw new Error(`libghostty-vt layout is missing: ${name}`)
    }
    return layout
  }

  field(structName: string, fieldName: string) {
    const field = this.layout(structName).fields[fieldName]
    if (!field) {
      throw new Error(
        `libghostty-vt field is missing: ${structName}.${fieldName}`
      )
    }
    return field
  }

  alloc(size: number) {
    const pointer = this.call('ghostty_wasm_alloc_u8_array', size)
    if (pointer === 0) {
      throw new Error(`libghostty-vt could not allocate ${size} bytes`)
    }
    new Uint8Array(this.memory.buffer, pointer, size).fill(0)
    return pointer
  }

  free(pointer: number, size: number) {
    if (pointer !== 0) {
      this.call('ghostty_wasm_free_u8_array', pointer, size)
    }
  }

  allocOpaque() {
    const pointer = this.call('ghostty_wasm_alloc_opaque')
    if (pointer === 0) {
      throw new Error('libghostty-vt could not allocate a pointer')
    }
    new DataView(this.memory.buffer).setUint32(pointer, 0, true)
    return pointer
  }

  freeOpaque(pointer: number) {
    if (pointer !== 0) {
      this.call('ghostty_wasm_free_opaque', pointer)
    }
  }

  readPointer(slot: number) {
    return this.dataView().getUint32(slot, true)
  }

  check(operation: string, result: number) {
    if (result !== SUCCESS) {
      throw new Error(`${operation} failed with result ${result}`)
    }
  }

  flag(
    operation: 'ghostty_terminal_get' | 'ghostty_terminal_mode_get',
    terminal: number,
    key: number
  ) {
    const pointer = this.alloc(1)
    const result = this.call(operation, terminal, key, pointer)
    const value = this.bytes(pointer, 1)[0]
    this.free(pointer, 1)
    return result === SUCCESS && value !== 0
  }

  encodeOutput(
    encode: (output: number, size: number, written: number) => number
  ) {
    const written = this.call('ghostty_wasm_alloc_usize')
    let encoded = ''
    const sizeResult = encode(0, 0, written)
    const size = this.view(written, 4).getUint32(0, true)
    if (sizeResult === OUT_OF_SPACE && size > 0) {
      const output = this.alloc(size)
      const result = encode(output, size, written)
      const length = this.view(written, 4).getUint32(0, true)
      if (result === SUCCESS) {
        encoded = decoder.decode(this.bytes(output, length))
      }
      this.free(output, size)
    }
    this.call('ghostty_wasm_free_usize', written)
    return encoded
  }

  attachHost(terminal: number, host: TerminalHost) {
    const id = this.nextHostId++
    this.hosts.set(id, host)
    this.call('ghostty_terminal_set', terminal, OPTION.userdata, id)
    for (const option of [
      [OPTION.writePty, this.callbacks.writePty],
      [OPTION.deviceAttributes, this.callbacks.deviceAttributes],
      [OPTION.size, this.callbacks.size],
      [OPTION.bell, this.callbacks.bell],
      [OPTION.xtversion, this.callbacks.xtversion],
    ] as const) {
      this.call('ghostty_terminal_set', terminal, option[0], option[1])
    }
    return id
  }

  detachHost(terminal: number, id: number) {
    this.call('ghostty_terminal_set', terminal, OPTION.xtversion, 0)
    this.call('ghostty_terminal_set', terminal, OPTION.bell, 0)
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
    if (this.memoryView.buffer !== this.memory.buffer) {
      this.memoryView = new DataView(this.memory.buffer)
    }
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
    if (field.type === 'bool' || field.type === 'u8') {
      return view.getUint8(offset)
    }
    if (field.type === 'u16') {
      return view.getUint16(offset, true)
    }
    if (field.type === 'i32') {
      return view.getInt32(offset, true)
    }
    if (field.type === 'u32' || field.type === 'enum') {
      return view.getUint32(offset, true)
    }
    if (field.type === 'u64') {
      return Number(view.getBigUint64(offset, true))
    }
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
            if (!host || length === 0) {
              return
            }
            host.write(
              decoder.decode(
                new Uint8Array(this.memory.buffer, pointer, length)
              )
            )
          },
          d: (_terminal: number, userdata: number, pointer: number) => {
            if (!this.hosts.has(userdata)) {
              return 0
            }
            this.writeDeviceAttributes(pointer)
            return 1
          },
          s: (_terminal: number, userdata: number, pointer: number) => {
            const host = this.hosts.get(userdata)
            if (!host) {
              return 0
            }
            const size = host.size()
            const name = 'GhosttySizeReportSize'
            this.setField(pointer, name, 'rows', size.rows)
            this.setField(pointer, name, 'columns', size.columns)
            this.setField(pointer, name, 'cell_width', size.cellWidth)
            this.setField(pointer, name, 'cell_height', size.cellHeight)
            return 1
          },
          b: (_terminal: number, userdata: number) => {
            this.hosts.get(userdata)?.bell()
          },
          v: (result: number, _terminal: number, userdata: number) => {
            const host = this.hosts.get(userdata)
            if (!host) {
              return
            }
            this.writeVersion(result, host.version())
          },
          p: (
            _userdata: number,
            allocator: number,
            pointer: number,
            length: number,
            output: number
          ) => this.decodePng(allocator, pointer, length, output),
        },
      }
    )
    const table = this.exports.__indirect_function_table
    if (!(table instanceof WebAssembly.Table)) {
      throw new Error('libghostty-vt did not expose its callback table')
    }
    const indexes = ['w', 'd', 's', 'b', 'v', 'p'].map((name) => {
      const callback = instance.exports[name]
      if (typeof callback !== 'function') {
        throw new Error(`libghostty-vt callback is missing: ${name}`)
      }
      const index = table.length
      table.grow(1)
      table.set(index, callback)
      return index
    })
    this.callbacks = {
      writePty: indexes[0],
      deviceAttributes: indexes[1],
      size: indexes[2],
      bell: indexes[3],
      xtversion: indexes[4],
    }
    if (this.call('ghostty_sys_set', SYS_DECODE_PNG, indexes[5]) !== 0) {
      throw new Error('libghostty-vt did not accept the PNG decoder')
    }
  }

  private decodePng(
    allocator: number,
    pointer: number,
    length: number,
    output: number
  ) {
    let image: ReturnType<typeof decodePng>
    try {
      image = decodePng(new Uint8Array(this.memory.buffer, pointer, length))
    } catch (error) {
      console.warn('could not decode a kitty PNG image', error)
      return 0
    }
    const data = this.call('ghostty_alloc', allocator, image.data.length)
    if (data === 0) {
      return 0
    }
    this.bytes(data, image.data.length).set(image.data)
    const view = this.dataView()
    view.setUint32(output + SYS_IMAGE.width, image.width, true)
    view.setUint32(output + SYS_IMAGE.height, image.height, true)
    view.setUint32(output + SYS_IMAGE.data, data, true)
    view.setUint32(output + SYS_IMAGE.length, image.data.length, true)
    return 1
  }

  private writeVersion(result: number, version: string) {
    const bytes = encoder.encode(version)
    this.free(this.version.pointer, this.version.size)
    const pointer = this.alloc(bytes.length)
    this.bytes(pointer, bytes.length).set(bytes)
    this.version = { pointer, size: bytes.length }
    this.dataView().setUint32(
      result + this.field('GhosttyString', 'ptr').offset,
      pointer,
      true
    )
    this.setField(result, 'GhosttyString', 'len', bytes.length)
  }

  private writeDeviceAttributes(pointer: number) {
    const primary =
      pointer + this.field('GhosttyDeviceAttributes', 'primary').offset
    const secondary =
      pointer + this.field('GhosttyDeviceAttributes', 'secondary').offset
    const tertiary =
      pointer + this.field('GhosttyDeviceAttributes', 'tertiary').offset
    const primaryName = 'GhosttyDeviceAttributesPrimary'
    const secondaryName = 'GhosttyDeviceAttributesSecondary'
    const features = primary + this.field(primaryName, 'features').offset
    const view = this.dataView()
    const supported = [4, 22]
    supported.forEach((feature, index) =>
      view.setUint16(features + index * 2, feature, true)
    )
    this.setField(primary, primaryName, 'conformance_level', 62)
    this.setField(primary, primaryName, 'num_features', supported.length)
    this.setField(secondary, secondaryName, 'device_type', 0)
    this.setField(secondary, secondaryName, 'firmware_version', 276)
    this.setField(secondary, secondaryName, 'rom_cartridge', 0)
    this.setField(tertiary, 'GhosttyDeviceAttributesTertiary', 'unit_id', 0)
  }
}

let runtime: GhosttyRuntime | null = null

export async function loadGhostty() {
  runtime = await GhosttyRuntime.load()
}

export function ghostty() {
  if (!runtime) {
    throw new Error('libghostty-vt is not loaded')
  }
  return runtime
}
