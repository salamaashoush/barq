import { Annotation, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

/** An extension, or an accessor the editor follows. */
export type ExtensionSource = Extension | (() => Extension);

export function extensionOf(source: ExtensionSource | undefined): Extension {
  if (source === undefined) return [];
  return typeof source === "function" ? source() : source;
}

function cssLength(value: string | number): string {
  return typeof value === "number" ? `${String(value)}px` : value;
}

export interface CodeSizes {
  minHeight?: string | number | undefined;
  maxHeight?: string | number | undefined;
  tabSize?: number | undefined;
}

/** The custom properties a code surface sizes itself by, for its `style`. */
export function codeVars(sizes: CodeSizes): Record<string, string> {
  const vars: Record<string, string> = {};
  if (sizes.minHeight !== undefined) vars["--code-min-height"] = cssLength(sizes.minHeight);
  if (sizes.maxHeight !== undefined) vars["--code-max-height"] = cssLength(sizes.maxHeight);
  if (sizes.tabSize !== undefined) vars["--code-tab-size"] = String(sizes.tabSize);
  return vars;
}

/** Marks a transaction that brought the caller's text in, so it is not reported back. */
export const fromCaller = Annotation.define<boolean>();

/**
 * The document as the caller last knew it (what it passed in, or what was
 * last reported to it), and the one report a tick of the user's changes comes
 * to. A value equal to `known` needs no write, and a change that ends equal to
 * it needs no report.
 */
export interface ChangeReport {
  known: string;
  /** What an editor reports its user's changes through. */
  readonly listener: Extension;
  /** Report what is waiting now, before the editor it came from goes. */
  flush(): void;
}

export function changeReport(
  initial: string,
  current: () => string | undefined,
  notify: (doc: string) => void,
): ChangeReport {
  let reporting = false;
  function report(): void {
    reporting = false;
    const doc = current();
    if (doc === undefined || doc === out.known) return;
    out.known = doc;
    notify(doc);
  }
  const out: ChangeReport = {
    known: initial,
    listener: EditorView.updateListener.of((update) => {
      if (!update.docChanged || reporting) return;
      if (update.transactions.every((tr) => tr.annotation(fromCaller) === true)) return;
      reporting = true;
      queueMicrotask(report);
    }),
    flush: () => {
      if (reporting) report();
    },
  };
  return out;
}
