/**
 * @barqjs/compiler
 *
 * Transforms clean JSX into fine-grained reactive code for Barq.
 *
 * ## What it does
 *
 * 1. **Tracks reactive sources**: useState, useStore, useMemo, useResource
 * 2. **Transforms JSX expressions**: Wraps reactive expressions in () =>
 * 3. **Transforms control flow**: Adds callbacks to Show, For, Switch, etc.
 * 4. **Auto-computed detection**: Converts derived values to useMemo
 *
 * ## Usage with Babel
 *
 * ```js
 * // babel.config.js
 * module.exports = {
 *   plugins: [
 *     ['@barqjs/compiler/babel', {
 *       autoComputed: true,
 *       dev: process.env.NODE_ENV !== 'production'
 *     }]
 *   ]
 * }
 * ```
 *
 * ## Usage with Vite
 *
 * ```js
 * // vite.config.js
 * import { barqPlugin } from '@barqjs/compiler/vite'
 *
 * export default {
 *   plugins: [barqPlugin()]
 * }
 * ```
 *
 * ## Example Transformation
 *
 * Input:
 * ```tsx
 * const [count, setCount] = useState(0)
 * const doubled = count * 2
 *
 * <Show when={count > 0}>
 *   <div>{doubled}</div>
 * </Show>
 * ```
 *
 * Output:
 * ```tsx
 * const [count, setCount] = useState(0)
 * const doubled = useMemo(() => count() * 2)
 *
 * <Show when={() => count() > 0}>
 *   {() => <div>{doubled}</div>}
 * </Show>
 * ```
 */

export { default as barqBabelPlugin } from "./babel.js"
export type { BarqCompilerOptions } from "./babel.js"

export type {
  ReactiveSourceType,
  ReactiveBinding,
  ScopeState,
  PluginState,
} from "./types.js"

export {
  isReactiveIdentifier,
  registerReactiveBinding,
  pushScope,
  popScope,
  isInsideJSX,
  isInsideEventHandler,
  isInsideCallback,
  DEFAULT_CONTROL_FLOW,
  DEFAULT_LIST_COMPONENTS,
} from "./types.js"

export * from "./transforms/index.js"
