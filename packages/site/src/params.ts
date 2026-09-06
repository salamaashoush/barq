/**
 * The design system being configured, in the URL.
 *
 * shadcn's `/create` keeps its choices in the query string, and the reason is
 * not tidiness: it is what makes a configuration a LINK. Somebody picks a base,
 * a theme and a radius, copies the address bar, and the person who opens it
 * sees the same page. State in a signal alone cannot be sent to anyone.
 *
 * `replaceState` rather than `pushState`, because every picker would otherwise
 * put an entry in the history and Back would walk one token at a time.
 *
 * THE STYLE AND THE THEME ARE SCOPED TO THE PREVIEW, which is the one decision
 * here that is not upstream's spelling of it. Upstream renders the preview in
 * an `<iframe>` and the customizer outside it, so the configurator is never
 * touched by what is being configured. This gallery renders in place, and
 * putting `style-<name>` on `<html>` made the configurator restyle ITSELF: the
 * style changes a menu item's font size, the item resizes under the pointer,
 * the pointer is now over a different item, that item's style applies, and the
 * two swap forever. A feedback loop, not a slow update. The style class and the
 * chosen theme go on the preview element; the page and the customizer keep a
 * fixed theme of their own, which is what the iframe was buying.
 */

import { effect, signal, type Accessor } from "@barqjs/core";
import { useLocation } from "@barqjs/router";
import { installTheme, type ThemeSelection } from "@barqjs/ui";

import {
  BASE_COLORS,
  CHART_COLORS,
  FONTS,
  HEADING_FONTS,
  MONO,
  RADII,
  STYLES,
  THEMES,
  type Option,
} from "./options.ts";
import { previewOverride } from "./preview-override.ts";

export interface Params {
  readonly style: string;
  readonly baseColor: string;
  readonly theme: string;
  readonly chartColor: string;
  readonly radius: string;
  readonly font: string;
  readonly fontHeading: string;
  readonly mono: string;
  readonly dark: boolean;
  /**
   * Which composition the preview shows, by upstream's registry name.
   *
   * `item` in their `search-params.ts`, and `shallow: true` there: it belongs
   * in the URL, so "look at this in this theme" is a link, but it is not the
   * page. A block is a page — `/blocks/dashboard-01` — and this is the flip
   * between two whole-application previews while you configure one.
   */
  readonly item: string;
}

/**
 * shadcn's own `DEFAULT_CONFIG`, in this package's spelling.
 *
 * `registry/config.ts` upstream: style `nova`, base and theme `neutral`, the
 * chart ramp the theme's own, radius default. Opening this site with no search
 * string therefore shows what opening theirs shows, which is the point of a
 * replacement rather than a gallery.
 *
 * The chart ramp is `blue`, which is what their SITE draws with:
 * `app/globals.css` overrides `--chart-1` to `--color-blue-300` through
 * `--color-blue-800`, and the greyscale ramp `registry/base-colors.ts` gives
 * `neutral` is what a consumer's own app starts from. This is the site.
 *
 * `font` is Geist, which is what `lib/fonts.ts` loads for the site itself.
 * Bundled rather than fetched, so it works offline and cannot half-load.
 */
export const DEFAULTS: Params = {
  style: "nova",
  baseColor: "neutral",
  theme: "none",
  chartColor: "blue",
  radius: "none",
  font: "geist",
  fontHeading: "inherit",
  mono: "geist-mono",
  dark: false,
  item: "preview-02",
};

/** `"none"` is a choice, so it needs a key; the selection turns it back into absence. */
export const NONE = "none";

/** The heading font that is whatever the body font is, which is shadcn's default. */
export const INHERIT = "inherit";

/**
 * The element the style and the chosen theme are scoped to.
 *
 * A selector rather than a class, because `installTheme` takes one and the
 * element already carries the name for its own sake.
 */
export const PREVIEW_SCOPE = '[data-slot="preview"]';

/**
 * The front page's card panel, which upstream marks `theme-neutral`.
 *
 * Its charts are the greyscale ramp `base-colors.ts` gives `neutral`, not the
 * blue the site around it draws with. A wall of cards is showing SHAPE — the
 * radius, the spacing, the type — and five accent colours competing across
 * twenty cards is noise over the thing being shown.
 */
export const DEMO_SCOPE = '[data-slot="demo"]';

/**
 * What the page around the preview wears, and never changes.
 *
 * shadcn's site is neutral and its customizer is `dark` over that. Keeping it
 * fixed is the point: chrome that changes colour with the thing it is
 * configuring stops being a fixed point to judge the change against.
 */
const CHROME: ThemeSelection = { base: "neutral" };

function oneOf(options: readonly Option[], value: string | null, fallback: string): string {
  if (value === null) return fallback;
  return options.some((option) => option.value === value) ? value : fallback;
}

/**
 * A URL is somebody else's input, so nothing in it is trusted. An unknown base
 * falls back rather than throwing: a link with a typo should still open.
 */
export function read(search: string): Params {
  const query = new URLSearchParams(search);
  return {
    style: oneOf(STYLES, query.get("style"), DEFAULTS.style),
    baseColor: oneOf(BASE_COLORS, query.get("baseColor"), DEFAULTS.baseColor),
    theme: oneOf(THEMES, query.get("theme"), DEFAULTS.theme),
    chartColor: oneOf(CHART_COLORS, query.get("chartColor"), DEFAULTS.chartColor),
    radius: oneOf(RADII, query.get("radius"), DEFAULTS.radius),
    font: oneOf(FONTS, query.get("font"), DEFAULTS.font),
    fontHeading: oneOf(HEADING_FONTS, query.get("fontHeading"), DEFAULTS.fontHeading),
    mono: oneOf(MONO, query.get("mono"), DEFAULTS.mono),
    dark: query.get("dark") === "1",
    item: query.get("item") ?? DEFAULTS.item,
  };
}

const KEYS = [
  "style",
  "baseColor",
  "theme",
  "chartColor",
  "radius",
  "font",
  "fontHeading",
  "mono",
] as const;

/** Only what differs from the default, so a shared link is short and readable. */
export function write(params: Params): string {
  const query = new URLSearchParams();
  for (const key of KEYS) {
    if (params[key] !== DEFAULTS[key]) query.set(key, params[key]);
  }
  if (params.dark) query.set("dark", "1");
  if (params.item !== DEFAULTS.item) query.set("item", params.item);
  const text = query.toString();
  return text === "" ? "" : `?${text}`;
}

function stackOf(options: readonly Option[], value: string): string | undefined {
  return options.find((option) => option.value === value)?.css;
}

/**
 * The radius a style has already decided, which is `lyra` and only `lyra`.
 *
 * Upstream's `effectiveRadius` is `style === "lyra" ? "none" : radius`, while
 * its picker locks for `sera` too — the control says None there and the token
 * keeps whatever it had, because sera's own stylesheet overrules it anyway.
 * Copied as it is rather than tidied: matching the inconsistency is what makes
 * the two pages the same page.
 */
function radiusFor(params: Params): string {
  return params.style === "lyra" ? "0" : params.radius;
}

/** The selection `installTheme` and the copy-out both read. */
export function selectionOf(params: Params): ThemeSelection {
  const sans = stackOf(FONTS, params.font);
  const mono = stackOf(MONO, params.mono);
  // `inherit` is the absence of a heading font rather than a font called
  // inherit, so it contributes nothing and `--font-heading` falls back to sans.
  const heading =
    params.fontHeading === INHERIT ? undefined : stackOf(HEADING_FONTS, params.fontHeading);
  const fonts = {
    ...(sans === undefined ? {} : { sans }),
    ...(mono === undefined ? {} : { mono }),
    ...(heading === undefined ? {} : { heading }),
  };
  return {
    base: params.baseColor,
    ...(params.theme === NONE ? {} : { accent: params.theme }),
    ...(params.chartColor === NONE ? {} : { chart: params.chartColor }),
    ...(radiusFor(params) === NONE ? {} : { radius: radiusFor(params) }),
    ...(Object.keys(fonts).length === 0 ? {} : { fonts }),
  };
}

/**
 * The `barq-ui init` that reproduces what is on the screen.
 *
 * A configurator that only shows colours leaves the reader to translate them,
 * and the translation is the part that goes wrong. Only what differs from the
 * default is named, so the command is as short as the choice was.
 */
export function commandFor(params: Params): string {
  const flags: string[] = [];
  for (const [flag, key] of [
    ["--style", "style"],
    ["--theme", "baseColor"],
    ["--accent", "theme"],
    ["--radius", "radius"],
  ] as const) {
    const value = params[key];
    if (value !== DEFAULTS[key] && value !== NONE) flags.push(`${flag} ${value}`);
  }
  return `bunx @barqjs/ui-cli init${flags.length === 0 ? "" : " "}${flags.join(" ")}`;
}

export interface Design {
  /** What is committed: what the URL holds and what a copied link reproduces. */
  readonly params: Accessor<Params>;
  /** The committed choice with whatever is being hovered on top, which is what the preview wears. */
  readonly previewed: Accessor<Params>;
  /** The committed choice, which goes in the URL. */
  set(next: Partial<Params>): void;
  /**
   * A choice being HOVERED, applied to the preview and not to the URL.
   *
   * shadcn previews on hover for a reason worth keeping: choosing a colour
   * scheme is comparing, and a list you have to click through and undo is a
   * different task from one you sweep.
   */
  preview(next: Partial<Params>): void;
  /** Instantly, because reverting must not lag. */
  clearPreview(): void;
  reset(): void;
  /** The element the style and the theme are scoped to. */
  wear(element: HTMLElement | null): void;
  /** Which composition the preview shows, and the flip between them. */
  readonly item: Accessor<string>;
  setItem(next: string): void;
}

/**
 * The eight stylesheets, one chunk each, fetched on demand.
 *
 * `import.meta.glob` gives Vite a chunk per file, so opening the page costs one
 * style rather than eight. Module scope rather than inside `design()`, because
 * the SITE loads them too now and two `loaded` sets would fetch each sheet
 * twice.
 */
const SHEETS = import.meta.glob("../../ui/styles/*.css");
const LOADED = new Set<string>();

/** `style-<name>` on one element, and every other style's class off it. */
function markStyle(element: HTMLElement, name: string): void {
  for (const each of STYLES) {
    if (each.value === NONE) continue;
    element.classList.toggle(`style-${each.value}`, each.value === name);
  }
}

/**
 * Put a style on an element, fetching its sheet first if this is the first ask.
 *
 * `still` is what stops a race applying a stale choice: the sheet is in flight
 * for a beat, and the pointer may have moved on to another style by the time it
 * lands. `none` names no stylesheet, so it takes the class OFF rather than
 * adding a `style-none` that selects nothing and reads as a real choice in
 * devtools.
 */
export function wearStyleOn(element: HTMLElement | null, name: string, still: () => boolean): void {
  if (element === null) return;
  if (name === NONE || LOADED.has(name)) {
    markStyle(element, name);
    return;
  }
  const load = SHEETS[`../../ui/styles/${name}.css`];
  if (load === undefined) return;
  void load().then(() => {
    LOADED.add(name);
    if (still()) markStyle(element, name);
  });
}

/**
 * The theme the SITE wears, from the same URL the designer writes.
 *
 * Every page outside `/create` had no theme at all: `design()` is the
 * designer's own, so `--chart-1`, `--radius` and the rest were undefined
 * everywhere else. An undefined `var()` is not a fallback — the declaration is
 * invalid at computed-value time and the property takes its INITIAL value — so
 * the charts drew grey, every corner was square and the type was the browser's.
 *
 * The style class goes on `<html>` here, which is what the designer must NOT
 * do: putting it there while the customizer is on screen makes the customizer
 * restyle ITSELF under the pointer, and a menu item that resizes as you hover
 * it swaps rows forever. There is no customizer on any other page, so the
 * document is the right scope and the whole page is themed.
 */
/**
 * What the site reads out of the URL, and the two things that still change.
 *
 * The THEME is not one of them. `src/theme.ts` is a `globalCss` block the
 * compiler folds into the stylesheet the document links, so the page arrives
 * themed rather than being themed by a script — which is the whole of the FOUC
 * answer and is what `barq-ui init` writes into any project. Registering the
 * same rules from an effect here would have been a second source for one fact,
 * and the one that runs after the document is already on screen.
 *
 * What is left is genuinely dynamic: the `dark` class, and the style class an
 * explicit `?style=` asks for. Both are attributes on `<html>`, and `dark` is
 * written by the SERVER into the markup rather than toggled on hydration.
 */
export function installSite(): { params: Accessor<Params>; set(next: Partial<Params>): void } {
  const here = useLocation();
  const current = signal<Params>(read(here().search));

  const apply = (): void => {
    const now = current();
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    root.classList.toggle("dark", now.dark);
    // The style is NOT put on the document by default, because upstream's site
    // does not wear one: their chrome imports `registry/new-york-v4/ui/*`
    // directly and only the designer's preview is styled. A site that styled
    // itself disagreed with theirs everywhere a style has an opinion — the
    // announcement badge came out at a 32px radius against their `rounded-full`
    // — which is the opposite of what a port is for.
    //
    // An EXPLICIT `?style=` still applies, because being able to read this site
    // in each of the eight is worth having and costs nothing when nobody asks.
    wearStyleOn(
      root,
      now.style === DEFAULTS.style ? NONE : now.style,
      () => current().style === now.style,
    );
  };

  // The front page's card panel, which upstream marks `theme-neutral`. Scoped,
  // so it is a rule ABOUT an element rather than the document's own theme, and
  // registering it during render is what puts it in the inlined sheet.
  installTheme({ base: "neutral", scope: DEMO_SCOPE });
  effect(apply);

  // The router owns the URL, so its location is what the theme follows. A
  // `popstate` listener would miss a `<Link>` — that is a `pushState` — and a
  // click listener guessing at a microtask would race the router's own write.
  effect(() => {
    const next = read(here().search);
    if (write(next) !== write(current())) current.set(next);
  });

  return {
    params: current,
    set(next) {
      current.update((prev) => ({ ...prev, ...next }));
      if (typeof history !== "undefined") {
        history.replaceState(null, "", `${location.pathname}${write(current())}`);
      }
    },
  };
}

export function design(): Design {
  const committed = signal<Params>(read(typeof location === "undefined" ? "" : location.search));
  const hovered = previewOverride<Params>();
  const previewed = (): Params => ({ ...committed(), ...hovered.value() });

  let host: HTMLElement | null = null;

  const wearStyle = (name: string): void =>
    wearStyleOn(host, name, () => previewed().style === name);

  const apply = (): void => {
    const now = previewed();
    installTheme({ ...selectionOf(now), scope: PREVIEW_SCOPE });
    // BOTH, and they are different claims. The preview wears the theme being
    // configured; the page around it wears the fixed one and only follows the
    // light/dark switch. Pinning the chrome to light left the body white behind
    // a dark page, which is not what shadcn's looks like — their site is dark
    // when you are working dark, and only the customizer is dark unconditionally.
    //
    // This cannot bring the flicker back: `dark` is the one parameter no picker
    // previews, so it changes on a commit and never under the pointer.
    host?.classList.toggle("dark", now.dark);
    if (typeof document !== "undefined") {
      document.documentElement.classList.toggle("dark", now.dark);
    }
    wearStyle(now.style);
  };

  // The chrome first, so the page has tokens before the preview overrides them
  // inside its own subtree. Two scopes, never one: `:root` matches `<html>` and
  // the preview's selector matches the preview, so they never contend.
  installTheme(CHROME);

  // An EFFECT rather than a call at each of the four places that change
  // something. The override is debounced, so its signal lands a beat after the
  // pointer settles and a caller that applied eagerly would read the value it
  // had before. Reading `previewed()` here is what makes both halves — the
  // committed choice and the hovered one — reach the page the same way.
  effect(apply);

  const writeUrl = (): void => {
    if (typeof history === "undefined") return;
    history.replaceState(null, "", `${location.pathname}${write(committed())}`);
  };

  // Back and Forward are real here — the router owns the path and every block
  // is a route — so the search has to be read back on one too: `retainSearchParams`
  // carries it across a navigation, and a page that never re-read it would show
  // the theme it started with whatever the URL said.
  if (typeof window !== "undefined") {
    window.addEventListener("popstate", () => {
      committed.set(read(location.search));
    });
  }

  return {
    params: committed,
    previewed,
    set(next) {
      committed.update((prev) => ({ ...prev, ...next }));
      hovered.clear();
      writeUrl();
    },
    preview(next) {
      hovered.set(next);
    },
    clearPreview() {
      hovered.clear();
    },
    item: () => committed().item,
    setItem(next) {
      committed.update((prev) => ({ ...prev, item: next }));
      writeUrl();
    },
    reset() {
      committed.set(DEFAULTS);
      hovered.clear();
      if (typeof history !== "undefined") history.replaceState(null, "", location.pathname);
    },
    wear(element) {
      host = element;
      apply();
    },
  };
}
