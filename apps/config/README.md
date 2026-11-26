# @offsite/config

Layered config on top of a zod schema. The schema's defaults are the base, and each layer is merged on top of the one before it.

```ts
const config = new LayeredConfig(schema, [
  { key: 'config.json', value: ... },
  { key: 'config.local.json', value: ... },
])
// throws if two layers have the same key
// bad values in the starting layers are ignored, not thrown

config.value      // final config
config.defaults   // config from the schema defaults alone
config.layers     // [{ key, value }] raw values
config.resolved   // [{ key, value }] only the accepted values of each layer
config.dropped    // [{ layer, path, message }] ignored values, path [] = whole layer

config.ownerOf(path)   // key of the layer the value comes from, null = default
                       // e.g. ownerOf(['terminal', 'shell', 'macos'])

config.put(value, { layer?, force?, prefer? })    // full replace
config.patch(value, { layer?, force?, prefer? })  // deep update
// without layer: changes the final config, each change goes to the layer it comes from
// with layer:    changes that layer's raw value
// prefer: 'first' | 'last' → where a value goes when no layer sets it yet (default 'first')
// both return { value, dropped, changed: [{ key, value, changes: [{ path, before, after }] }] }
// both throw on bad values unless force: true
// both throw on an unknown layer key

config.onLayerUpdate((layer) => ...)   // once per changed layer
config.onUpdate((result) => ...)       // once per put/patch that changed something
// both return a function that unsubscribes
// value, layers, resolved and dropped are already updated when these fire
```
