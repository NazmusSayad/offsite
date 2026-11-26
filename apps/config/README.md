# @offsite/config

Layered config on top of a zod schema. The schema's defaults are the base, and each layer is merged on top of the one before it.

```ts
const config = new LayeredConfig(schema, [
  { key: 'config.json', value: ... },
  { key: 'env', value: ..., readonly: true },
  { key: 'config.local.json', value: ... },
])
// later layers override earlier ones, readonly or not
// throws if two layers have the same key
// bad values in the starting layers are ignored, not thrown

config.value      // final config
config.defaults   // config from the schema defaults alone
config.layers     // [{ key, value, readonly }] raw values
config.resolved   // [{ key, value, readonly }] only the accepted values of each layer
config.dropped    // [{ layer, path, message }] ignored values, path [] = whole layer

config.get(path)   // e.g. get(['terminal', 'shell', 'macos'])
// {
//   value,      // final value
//   default,    // value from the schema defaults
//   owner,      // key of the layer the value comes from, null = default
//   readonly,   // true if the owner layer is readonly
//   layers,     // [{ key, value, readonly }] every layer that sets it, lowest first
// }

config.put(value, { layer?, force?, prefer? })    // full replace
config.patch(value, { layer?, force?, prefer? })  // deep update
// without layer: changes the final config, each change goes to the layer it comes from
// with layer:    changes that layer's raw value
// prefer: 'first' | 'last' → where a value goes when no layer sets it yet (default 'first')
// both return { value, dropped, changed: [{ key, value, changes: [{ path, before, after }] }] }
// both throw on bad values unless force: true
// both throw on an unknown layer key
// readonly layers are never written:
//   with layer: throws if that layer is readonly, even with force
//   without layer: throws if a change touches a value a readonly layer sets,
//   and prefer skips readonly layers

config.onBeforeUpdate((result) => ...)  // before the change is applied, all changed layers
                                        // throws → nothing changes and put/patch throws
                                        // config.value is still the old value here
config.onLayerUpdate((layer) => ...)   // once per changed layer
config.onUpdate((result) => ...)       // once per put/patch that changed something
// all three return a function that unsubscribes
// value, layers, resolved and dropped are already updated when onLayerUpdate and onUpdate fire
```
