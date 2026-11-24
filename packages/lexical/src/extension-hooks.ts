import { type Accessor, onCleanup } from "@barqjs/core";
import {
  type ReadonlySignal,
  getExtensionDependencyFromEditor,
  getPeerDependencyFromEditor,
} from "@lexical/extension";
import type {
  AnyLexicalExtension,
  LexicalExtensionDependency,
  LexicalExtensionOutput,
} from "lexical";

import { useLexicalEditor } from "./context.ts";
import { mirror } from "./hooks.ts";

/** An extension of the editor in scope: its config and output. Throws when the editor lacks it. */
export function useExtensionDependency<Extension extends AnyLexicalExtension>(
  extension: Extension,
): LexicalExtensionDependency<Extension> {
  return getExtensionDependencyFromEditor(useLexicalEditor(), extension);
}

/** An extension of the editor in scope, or `undefined` when the editor was built without it. */
export function usePeerExtensionDependency<Extension extends AnyLexicalExtension>(
  extensionName: Extension["name"],
): LexicalExtensionDependency<Extension> | undefined {
  return getPeerDependencyFromEditor<Extension>(useLexicalEditor(), extensionName);
}

/** {@link usePeerExtensionDependency}, named by the extension itself. */
export function useOptionalExtensionDependency<Extension extends AnyLexicalExtension>(
  extension: Extension,
): LexicalExtensionDependency<Extension> | undefined {
  return usePeerExtensionDependency<Extension>(extension.name);
}

/** The `Component` an extension outputs, such as `BarqExtension`'s. */
export function useExtensionComponent<Extension extends AnyLexicalExtension>(
  extension: Extension,
): ComponentOf<Extension> {
  return (useExtensionDependency(extension).output as ComponentOutput<ComponentOf<Extension>>)
    .Component;
}

interface ComponentOutput<Component> {
  Component: Component;
}

/** The `Component` an extension's output carries. */
export type ComponentOf<Extension extends AnyLexicalExtension> =
  LexicalExtensionOutput<Extension> extends ComponentOutput<infer Component> ? Component : never;

/**
 * A signal from `@lexical/extension`, the framework-free signals extensions
 * keep their state in, as a barq accessor for the owner this runs under.
 */
export function useSignalValue<V>(signal: ReadonlySignal<V>): Accessor<V> {
  const [value, setValue] = mirror(signal.peek());
  onCleanup(signal.subscribe(setValue));
  return value;
}

export type SignalValue<S> = S extends ReadonlySignal<infer V> ? V : never;

/** One signal an extension outputs, such as `HistoryExtension`'s, as a barq accessor. */
export function useExtensionSignalValue<
  Extension extends AnyLexicalExtension,
  K extends keyof LexicalExtensionOutput<Extension>,
>(extension: Extension, prop: K): Accessor<SignalValue<LexicalExtensionOutput<Extension>[K]>> {
  const signal = useExtensionDependency(extension).output[prop] as ReadonlySignal<
    SignalValue<LexicalExtensionOutput<Extension>[K]>
  >;
  return useSignalValue(signal);
}
