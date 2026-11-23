import {
  type Accessor,
  createContext,
  createRenderEffect,
  createSignal,
  getOwner,
  runWithOwner,
  setContext,
  useContext,
} from "@barqjs/core";
import { getRequestEvent, isHydrating, isServer, onHydrationEnd, useHead } from "@barqjs/web";
import { on } from "./event.ts";

/** What a reader picked: one of the themes, or `"system"` to follow the operating system. */
export type SchemeChoice<T extends string> = T | "system";

export interface ColorSchemeOptions<T extends string = "light" | "dark"> {
  /** The cookie the choice is kept in, read by the server as well as the page. @default "theme" */
  key?: string;
  /** @default ["light", "dark"] */
  themes?: readonly T[];
  /** The choice before a reader has made one. @default "system" when `system` is on, else the first theme */
  defaultChoice?: SchemeChoice<T>;
  /**
   * Offer `"system"`, which resolves to `"light"` or `"dark"` from
   * `prefers-color-scheme`. Both must then be among `themes`.
   * @default true
   */
  system?: boolean;
  /** Where the resolved theme is written on `<html>`: its class list, or a `data-` attribute. @default "class" */
  attribute?: "class" | `data-${string}`;
  /** The class or attribute value per theme, where it is not the theme's own name. */
  values?: Partial<Record<T, string>>;
  /** Also set `color-scheme` on `<html>` when the theme is light or dark, so scrollbars and form controls follow. @default true */
  colorScheme?: boolean;
  /** Suspend every CSS transition for the frame the theme changes in, so nothing animates between palettes. @default false */
  disableTransitionOnChange?: boolean;
  /** @default 31536000 (a year) */
  maxAge?: number;
  /** For a choice shared across subdomains. */
  domain?: string;
}

export interface ColorScheme<T extends string = "light" | "dark"> {
  /** What the reader picked, `"system"` included. */
  readonly choice: Accessor<SchemeChoice<T>>;
  /**
   * The theme in force. `undefined` while the choice is `"system"` and the
   * answer is not known yet: on the server, and in the browser until the page
   * has hydrated, because the server could not have known it either.
   */
  readonly resolved: Accessor<T | undefined>;
  /** What the operating system asks for, under the same rule as `resolved`. */
  readonly system: Accessor<"light" | "dark" | undefined>;
  readonly themes: readonly T[];
  /** Pick a theme, or `"system"`. Kept in the cookie, and every open tab follows it. */
  set(choice: SchemeChoice<T>): void;
}

const ColorSchemeContext = createContext<ColorScheme<string> | null>(null, "ColorScheme");

const DARK = "(prefers-color-scheme: dark)";

interface Resolved<T extends string> {
  key: string;
  themes: readonly T[];
  defaultChoice: SchemeChoice<T>;
  system: boolean;
  attribute: "class" | `data-${string}`;
  values: Partial<Record<T, string>>;
  colorScheme: boolean;
  disableTransitionOnChange: boolean;
  maxAge: number;
  domain: string | undefined;
}

function resolveOptions<T extends string>(options: ColorSchemeOptions<T> = {}): Resolved<T> {
  const themes = options.themes ?? (["light", "dark"] as unknown as readonly T[]);
  const system = options.system ?? true;
  if (system && !(themes.includes("light" as T) && themes.includes("dark" as T))) {
    throw new Error(
      `colorScheme: "system" resolves to "light" or "dark", so both must be among themes ` +
        `(${themes.join(", ")}). Add them, or pass system: false.`,
    );
  }
  const defaultChoice = options.defaultChoice ?? (system ? "system" : themes[0]!);
  return {
    key: options.key ?? "theme",
    themes,
    defaultChoice,
    system,
    attribute: options.attribute ?? "class",
    values: options.values ?? {},
    colorScheme: options.colorScheme ?? true,
    disableTransitionOnChange: options.disableTransitionOnChange ?? false,
    maxAge: options.maxAge ?? 31_536_000,
    domain: options.domain,
  };
}

function valid<T extends string>(raw: string | undefined, o: Resolved<T>): SchemeChoice<T> {
  if (raw === undefined) return o.defaultChoice;
  if (raw === "system" && o.system) return "system";
  return o.themes.includes(raw as T) ? (raw as T) : o.defaultChoice;
}

function readCookie(header: string | null | undefined, key: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const at = part.indexOf("=");
    if (at === -1 || part.slice(0, at).trim() !== key) continue;
    try {
      return decodeURIComponent(part.slice(at + 1).trim());
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/**
 * The script that puts the theme on `<html>` before the first paint.
 *
 * It reads the same cookie, so an explicit choice and `"system"` are both
 * right on the first frame, including on a prerendered page whose server
 * never saw the cookie. `colorScheme()` declares it in the head of a server
 * render; an app whose document is a static `index.html` puts this in it.
 */
export function colorSchemeScript<T extends string = "light" | "dark">(
  options?: ColorSchemeOptions<T>,
  serverChoice?: SchemeChoice<T>,
): string {
  const o = resolveOptions(options);
  const config = {
    k: o.key,
    t: o.themes,
    d: o.defaultChoice,
    y: o.system,
    a: o.attribute,
    v: o.values,
    c: o.colorScheme,
    s: serverChoice ?? null,
  };
  return (
    `(function(o){var w=window;(w.__BARQ_SCHEME__=w.__BARQ_SCHEME__||{})[o.k]=o.s;try{` +
    `var c,p=document.cookie.split(";");for(var i=0;i<p.length;i++){var j=p[i].indexOf("=");` +
    `if(j>-1&&p[i].slice(0,j).trim()===o.k){c=decodeURIComponent(p[i].slice(j+1).trim());break}}` +
    `if(c===undefined||!(o.t.indexOf(c)>-1||(o.y&&c==="system")))c=o.d;` +
    `var r=c==="system"?(matchMedia(${JSON.stringify(DARK)}).matches?"dark":"light"):c;` +
    `var e=document.documentElement,v=o.v[r]||r;` +
    `if(o.a==="class"){for(var n=0;n<o.t.length;n++)e.classList.remove(o.v[o.t[n]]||o.t[n]);e.classList.add(v)}` +
    `else e.setAttribute(o.a,v);` +
    `if(o.c&&(r==="light"||r==="dark"))e.style.colorScheme=r}catch(_){}})(` +
    `${JSON.stringify(config).replaceAll("<", "\\u003c")})`
  );
}

function apply<T extends string>(theme: T, o: Resolved<T>): void {
  const root = document.documentElement;
  const value = o.values[theme] ?? theme;
  if (o.attribute === "class") {
    for (const each of o.themes) root.classList.remove(o.values[each] ?? each);
    root.classList.add(value);
  } else {
    root.setAttribute(o.attribute, value);
  }
  if (o.colorScheme && (theme === "light" || theme === "dark")) root.style.colorScheme = theme;
}

/**
 * Pause every transition for one frame. A constructed sheet rather than a
 * `<style>`, because a nonce-based CSP refuses an inline style the page
 * inserts but not a sheet it adopts.
 */
function withoutTransitions(change: () => void): void {
  const sheet = new CSSStyleSheet();
  sheet.replaceSync("*,*::before,*::after{transition:none!important}");
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  change();
  void getComputedStyle(document.body).opacity;
  requestAnimationFrame(() => {
    document.adoptedStyleSheets = document.adoptedStyleSheets.filter((each) => each !== sheet);
  });
}

/**
 * A light, dark or system theme that is right on the first frame.
 *
 * The choice lives in a cookie, so the server renders with it; a script in
 * the head applies it to `<html>` before the page paints, so a dark reader
 * never sees a light flash; and the page follows the operating system and
 * every other open tab afterwards. It is provided to everything below the
 * component that calls it, which reads it back with `useColorScheme()`.
 *
 * ```tsx
 * const scheme = colorScheme();
 * <button onClick={() => scheme.set(scheme.resolved() === "dark" ? "light" : "dark")}>
 *   Toggle
 * </button>
 * ```
 *
 * Leave `<html>`'s `class` (or the chosen attribute) unbound in JSX: the
 * script and this primitive own it.
 */
export function colorScheme<T extends string = "light" | "dark">(
  options?: ColorSchemeOptions<T>,
): ColorScheme<T> {
  const o = resolveOptions(options);

  let live: SchemeChoice<T>;
  if (isServer) {
    live = valid(readCookie(getRequestEvent()?.request.headers.get("cookie"), o.key), o);
    useHead({
      tag: "script",
      props: { id: `barq-color-scheme-${o.key}` },
      children: colorSchemeScript(options, live),
    });
  } else {
    live = valid(readCookie(document.cookie, o.key), o);
  }

  // A page being hydrated has to build what the server wrote, and the server
  // left its own choice in the head script: a prerendered page's server never
  // saw the cookie. The live answers take over once hydration is done.
  const hydrating = !isServer && isHydrating();
  const served = hydrating
    ? (window as { __BARQ_SCHEME__?: Record<string, string | null> }).__BARQ_SCHEME__?.[o.key]
    : undefined;
  const media = !isServer && o.system ? window.matchMedia(DARK) : null;
  const osTheme = (): "light" | "dark" | undefined =>
    media === null ? undefined : media.matches ? "dark" : "light";

  const [picked, setChoice] = createSignal<string>(
    served === undefined || served === null ? live : valid(served, o),
  );
  const choice = picked as Accessor<SchemeChoice<T>>;
  const [system, setSystem] = createSignal<"light" | "dark" | undefined>(
    hydrating ? undefined : osTheme(),
  );

  const resolved = (): T | undefined => {
    const current = choice();
    return current === "system" ? (system() as T | undefined) : current;
  };

  const scheme: ColorScheme<T> = {
    choice,
    resolved,
    system,
    themes: o.themes,
    set(next) {
      const chosen = valid(next, o);
      setChoice(chosen as string);
      if (isServer) return;
      document.cookie =
        `${o.key}=${encodeURIComponent(chosen)}; Path=/; Max-Age=${o.maxAge}; SameSite=Lax` +
        (o.domain === undefined ? "" : `; Domain=${o.domain}`) +
        (location.protocol === "https:" ? "; Secure" : "");
    },
  };

  const owner = getOwner();
  if (owner !== null) setContext(ColorSchemeContext, scheme as unknown as ColorScheme<string>);
  if (isServer) return scheme;

  const wire = (): void => {
    if (media !== null) on(media, "change", (event) => setSystem(event.matches ? "dark" : "light"));
    // Another tab, or a response that set the cookie, changed the choice. The
    // cookie is the record, so it is read again rather than messaged about:
    // at once where the browser reports cookie changes, and in any case when
    // this tab is shown, which is the moment a stale theme would be seen.
    const reread = (): void => {
      setChoice(valid(readCookie(document.cookie, o.key), o) as string);
    };
    on(document, "visibilitychange", () => {
      if (document.visibilityState === "visible") reread();
    });
    const cookies = (globalThis as { cookieStore?: EventTarget }).cookieStore;
    if (cookies !== undefined) on(cookies, "change", reread);
    let first = true;
    createRenderEffect(resolved, (theme) => {
      if (theme === undefined) return;
      if (first || !o.disableTransitionOnChange) apply(theme, o);
      else withoutTransitions(() => apply(theme, o));
      first = false;
    });
  };

  if (hydrating) {
    onHydrationEnd(() => {
      setChoice(live as string);
      setSystem(osTheme());
      runWithOwner(owner, wire);
    });
  } else {
    wire();
  }
  return scheme;
}

/** The color scheme an ancestor set up with `colorScheme()`. */
export function useColorScheme<T extends string = "light" | "dark">(): ColorScheme<T> {
  const scheme = useContext(ColorSchemeContext)();
  if (scheme === null) {
    throw new Error("useColorScheme: no colorScheme() above this component.");
  }
  return scheme as unknown as ColorScheme<T>;
}
