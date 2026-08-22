/**
 * Global type configuration for Barq
 *
 * By default, Barq uses strict types that require explicit accessors/thunks.
 * This ensures code works correctly without the compiler.
 *
 * When using the Barq compiler (@barqjs/compiler), you can enable permissive
 * types that allow raw values where the compiler will wrap them.
 *
 * To enable compiler mode, add this to your project's type declarations:
 *
 * @example
 * ```typescript
 * // In your app's barq.d.ts or global.d.ts
 * declare global {
 *   namespace Barq {
 *     interface Config {
 *       COMPILER_MODE: true;
 *     }
 *   }
 * }
 * export {};
 * ```
 */

import type { Child } from "./dom.ts";

/**
 * Global namespace for Barq type configuration.
 * Augment Barq.Config interface to enable compiler mode.
 *
 * @example
 * ```typescript
 * // Enable compiler mode for permissive types
 * declare global {
 *   namespace Barq {
 *     interface Config {
 *       COMPILER_MODE: true;
 *     }
 *   }
 * }
 * export {};
 * ```
 */
declare global {
  namespace Barq {
    // Base config interface - augment this to enable compiler mode
    // by adding `COMPILER_MODE: true`
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface Config {}
  }
}

/**
 * Re-export for convenience
 */
export type BarqConfig = Barq.Config;

/**
 * Check if compiler mode is enabled via declaration merging.
 * Returns true if Barq.Config has COMPILER_MODE property set to true.
 */
export type IsCompilerMode = Barq.Config extends { COMPILER_MODE: true } ? true : false;

/**
 * Accessor type - a function that returns a value.
 * This is the fundamental reactive primitive.
 */
export type Accessor<T> = () => T;

/**
 * Strict accessor type for control flow props.
 *
 * - In strict mode (default): requires `() => T` (accessor/thunk)
 * - In compiler mode: allows `T | (() => T)` (value or accessor)
 *
 * Use this for props like `Show.when` or `Match.when` that need
 * to be reactive and re-evaluated when dependencies change.
 *
 * @example
 * ```typescript
 * // Strict mode (default)
 * <Show when={() => count() > 5}>  // Must wrap in thunk
 *
 * // Compiler mode
 * <Show when={count() > 5}>        // Compiler wraps it
 * ```
 */
export type StrictAccessor<T> = IsCompilerMode extends true ? T | Accessor<T> : Accessor<T>;

/**
 * What a component BODY sees, given the props its CALLER declares.
 *
 * The two directions are not the same type and conflating them is why an app
 * with `COMPILER_MODE` on cannot annotate a component at all. `StrictAccessor`
 * is the OUTGOING side — what a JSX call site may write, which the compiler
 * widens to `T | Accessor<T>` because it wraps a bare value in a thunk for you.
 * Incoming is the CALLEE side, and there the compiler has already done that: a
 * prop that is present is a Cell and is called at the use site (CODESIGN
 * §3.1), in every mode. So this is `Accessor` unconditionally.
 *
 * Optionality is preserved rather than stripped, because it is load-bearing:
 * a prop the caller omitted is not an own property, so the read is `?.()` and
 * the default lives beside it.
 *
 * @example
 * ```tsx
 * export function Button(props: Incoming<{ variant?: "primary" | "danger" }>) {
 *   const variant = () => props.variant?.() ?? "primary";
 * }
 * ```
 */
export type Incoming<P> = { [K in keyof P]: Accessor<P[K]> };

/**
 * Strict array accessor type for list iteration props.
 *
 * - In strict mode (default): requires `() => T[]` (accessor returning array)
 * - In compiler mode: allows `T[] | (() => T[])` (array or accessor)
 *
 * Use this for props like `For.each` or `Repeat.count`.
 *
 * @example
 * ```typescript
 * // Strict mode (default)
 * <For each={() => items()}>  // Must wrap in thunk
 *
 * // Compiler mode
 * <For each={items()}>        // Compiler wraps it
 * ```
 */
export type StrictArrayAccessor<T> = IsCompilerMode extends true
  ?
      | readonly T[]
      | T[]
      | undefined
      | null
      | false
      | Accessor<readonly T[] | T[] | undefined | null | false>
  : Accessor<readonly T[] | T[] | undefined | null | false>;

/**
 * Strict children type for control flow components.
 *
 * - In strict mode (default): requires `() => Child` (thunk)
 * - In compiler mode: allows `Child | (() => Child)` (direct or thunk)
 *
 * Use this for children props that need lazy evaluation.
 *
 * @example
 * ```typescript
 * // Strict mode (default)
 * <Show when={visible}>{() => <Content />}</Show>
 *
 * // Compiler mode
 * <Show when={visible}><Content /></Show>  // Compiler wraps children
 * ```
 */
export type StrictChild = IsCompilerMode extends true ? Child | Accessor<Child> : Accessor<Child>;
