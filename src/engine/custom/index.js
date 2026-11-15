// Custom effect handlers: the escape hatch for effects that cannot be typed.
// Scripts call them with { "op": "custom", "id": "<handler id>", "args": { ... } }.
// Every handler must be listed here (the validator prints this list) and takes
//   (ctx, args, scope) -> void   (mutate ctx.s through the helpers in ../core.js, emit via ctx.emit)
//
// Keep this file small: prefer extending the typed format.

export const CUSTOM = {
  // Test/diagnostic handler: emits a {t:'custom'} effect and changes nothing.
  'example.noop': (ctx, args) => {
    ctx.emit({ t: 'custom', id: 'example.noop', args: args || {} });
  },
};

export function listCustomHandlers() {
  return Object.keys(CUSTOM).sort();
}
