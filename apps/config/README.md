# @offsite/config

Layered config on top of a zod schema. The schema's defaults are the base, and each layer is merged on top of the one before it.

```ts
const config = new LayeredConfig<Config, Meta>(
  schema,
  [
    { key: 'config.json', value: ... },
    { key: 'env', value: ..., readonly: true },
    { key: 'config.local.json', value: ... },
  ],
  { historyLimit: 100 } // optional, default 100, 0 turns history off
)
// later layers override earlier ones, readonly or not
// throws if two layers have the same key
// bad values in the starting layers are ignored, not thrown
// Meta is the type of the meta you pass to put/patch/undo/redo

config.value      // final config
config.defaults   // config from the schema defaults alone
config.layers     // [{ key, value, readonly }] raw values
config.resolved   // [{ key, value, readonly }] only the accepted values of each layer
config.dropped    // [{ layer, path, message }] ignored values, path [] = whole layer
config.history    // { past: [...], future: [...] }
                  // each entry { method, options, meta, changed, at, before, after }
                  // before/after = all layers before and after that change
config.canUndo    // true if history.past isn't empty
config.canRedo    // true if history.future isn't empty

config.get(path)   // e.g. get(['terminal', 'shell', 'macos'])
// {
//   value,      // final value
//   default,    // value from the schema defaults
//   owner,      // key of the layer the value comes from, null = default
//   readonly,   // true if the owner layer is readonly
//   layers,     // [{ key, value, readonly }] every layer that sets it, lowest first
// }

config.put(value, { layer?, force?, prefer?, meta? })    // full replace
config.patch(value, { layer?, force?, prefer?, meta? })  // deep update
// without layer: changes the final config, each change goes to the layer it comes from
// with layer:    changes that layer's raw value
// prefer: 'first' | 'last' → where a value goes when no layer sets it yet (default 'first')
// meta: anything you want to pass along, e.g. { source: 'file' }
// both throw on bad values unless force: true
// both throw on an unknown layer key
// readonly layers are never written:
//   with layer: throws if that layer is readonly, even with force
//   without layer: throws if a change touches a value a readonly layer sets,
//   and prefer skips readonly layers
// every put/patch that changes something adds a history entry and clears history.future

config.undo({ meta? })   // puts the layers back to how they were before the last change
config.redo({ meta? })   // applies the last undone change again
// throw when there's nothing to undo/redo
// they move one entry between history.past and history.future, the entry keeps its meta

// put/patch/undo/redo all return
// {
//   method,    // 'put' | 'patch' | 'undo' | 'redo'
//   options,   // { layer, force, prefer } as passed
//   meta,      // as passed
//   value,     // new final config
//   dropped,   // ignored values
//   changed,   // [{ key, value, changes: [{ path, before, after }] }] only the layers that changed
// }

const anchor = config.on(event, (...args, anchor) => ...)
// returns an anchor like 'update:1', and the listener gets it as its last argument
// events:
//   'beforeUpdate'  (result, anchor)         before the change is applied, all changed layers
//                                            throws → nothing changes and the call throws
//                                            config.value is still the old value here
//   'layerUpdate'   (layer, result, anchor)  once per changed layer
//   'update'        (result, anchor)         once per call that changed something
// value, layers, resolved, dropped and history are already updated
// when 'layerUpdate' and 'update' fire

config.off(anchor)   // removes that listener, does nothing if it's already gone
                     // a listener can remove itself: config.off(anchor) inside it

// all state above is frozen: changing it throws
```
