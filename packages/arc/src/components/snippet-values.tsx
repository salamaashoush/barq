import {
  type Child,
  createContext,
  createSignal,
  getOwner,
  install,
  onCleanup,
  onSettled,
  untrack,
  useContext,
} from "@barqjs/core";
import { variants } from "@barqjs/css";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import { type } from "../style/index.ts";

/** Values a page's snippets show, by name: `origin`, `org`, `project`, `token`. */
export type SnippetValueMap = Readonly<Record<string, string>>;

/** What a reader's own values are, asked once the page is live; the request ends with the page. */
export type SnippetValueResolver = (
  signal: AbortSignal,
) => Partial<SnippetValueMap> | Promise<Partial<SnippetValueMap> | undefined> | undefined;

const SnippetValuesContext = createContext<SnippetValueMap>({}, "SnippetValues");

export interface SnippetValuesProviderProps {
  /** What the server writes and the first render in a browser shows: example values. */
  defaults: SnippetValueMap;
  /** Asked once after hydrating: the reader's own origin, workspace, project. */
  resolve?: SnippetValueResolver;
  /** Known now, over the defaults and whatever `resolve` found: a key just made. */
  values?: Partial<SnippetValueMap>;
  children?: Child;
}

/** The reader's own origin, for `resolve`: where the page they read is served from. */
export function readerOrigin(): Partial<SnippetValueMap> {
  return { origin: window.location.origin };
}

/**
 * Values the snippets below it show, with the reader's own swapped in once
 * the page is live: a server writes `https://acme.example.com`, the browser
 * the address it was loaded from.
 *
 * ```tsx
 * <SnippetValuesProvider
 *   defaults={{ origin: "https://acme.example.com", project: "storefront" }}
 *   resolve={readerOrigin}
 * >
 *   <Docs />
 * </SnippetValuesProvider>
 *
 * function Docs() {
 *   const values = useSnippetValues();
 *   return <TerminalBlock code={`curl ${values().origin}/api/health`} />;
 * }
 * ```
 *
 * The defaults are what hydration sees, so the server's markup is adopted as
 * it is; `resolve` runs after, and whatever it answers replaces the text in
 * place, shown and copied alike, with nothing announced and focus left
 * where it was.
 */
export function SnippetValuesProvider(props: SnippetValuesProviderProps) {
  const [resolved, setResolved] = createSignal<Partial<SnippetValueMap>>({}, { ownedWrite: true });
  function values(): SnippetValueMap {
    const out: Record<string, string> = { ...props.defaults };
    for (const source of [resolved(), props.values ?? {}]) {
      for (const [name, value] of Object.entries(source)) {
        if (value !== undefined) out[name] = value;
      }
    }
    return out;
  }
  const owner = getOwner();
  if (owner !== null) install(owner, SnippetValuesContext, values);
  const controller = new AbortController();
  onCleanup(() => controller.abort());
  onSettled(() => {
    const resolve = untrack(() => props.resolve);
    if (resolve === undefined) return;
    function take(found: Partial<SnippetValueMap> | undefined): void {
      if (found !== undefined && !controller.signal.aborted) {
        setResolved((current) => ({ ...current, ...found }));
      }
    }
    try {
      const answer = resolve(controller.signal);
      if (answer instanceof Promise) answer.then(take, () => {});
      else take(answer);
    } catch {
      // A reader's own values are a nicety: the defaults stay.
    }
  });
  return <>{props.children}</>;
}

/** The snippet values where the caller renders: the provider's, or none. */
export function useSnippetValues(): () => SnippetValueMap {
  return useContext(SnippetValuesContext);
}

export const snippetValueStyles = variants({
  slots: { root: arc(type.mono, { overflowWrap: "anywhere" }) },
});

type Slots = ReturnType<typeof snippetValueStyles>;

export interface SnippetValueProps extends Customisable<Slots> {
  name: string;
  /** Shown when no value has the name. @default the name */
  fallback?: string;
}

/** One snippet value in running text, such as the reader's project in a sentence. */
export function SnippetValue(props: SnippetValueProps) {
  const values = useSnippetValues();
  function cls(): Slots {
    return parts(snippetValueStyles(), props.classes);
  }
  return (
    <code
      class={arc(cls().root, props.class, props.className)}
      data-slot="snippet-value"
      data-name={props.name}
      dir="ltr"
    >
      {values()[props.name] ?? props.fallback ?? props.name}
    </code>
  );
}
