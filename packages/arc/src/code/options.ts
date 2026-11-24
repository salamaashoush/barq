import { Annotation, type Extension } from "@codemirror/state";

/** An extension, or an accessor the editor follows. */
export type ExtensionSource = Extension | (() => Extension);

export function extensionOf(source: ExtensionSource | undefined): Extension {
  if (source === undefined) return [];
  return typeof source === "function" ? source() : source;
}

function cssLength(value: string | number): string {
  return typeof value === "number" ? `${String(value)}px` : value;
}

/** The custom properties a code surface sizes itself by, for its `style`. */
export function codeVars(sizes: {
  minHeight?: string | number | undefined;
  maxHeight?: string | number | undefined;
  tabSize?: number | undefined;
}): Record<string, string> {
  const vars: Record<string, string> = {};
  if (sizes.minHeight !== undefined) vars["--code-min-height"] = cssLength(sizes.minHeight);
  if (sizes.maxHeight !== undefined) vars["--code-max-height"] = cssLength(sizes.maxHeight);
  if (sizes.tabSize !== undefined) vars["--code-tab-size"] = String(sizes.tabSize);
  return vars;
}

/** Marks a transaction that brought the caller's text in, so it is not reported back. */
export const fromCaller = Annotation.define<boolean>();
