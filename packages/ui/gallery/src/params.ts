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
}

export const DEFAULTS: Params = {
  style: "none",
  baseColor: "neutral",
  theme: "none",
  chartColor: "none",
  radius: "none",
  font: "system",
  fontHeading: "inherit",
  mono: "system",
  dark: false,
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
  const text = query.toString();
  return text === "" ? "" : `?${text}`;
}

function stackOf(options: readonly Option[], value: string): string | undefined {
  return options.find((option) => option.value === value)?.css;
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
    ...(params.radius === NONE ? {} : { radius: params.radius }),
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
}

export function design(): Design {
  const committed = signal<Params>(read(typeof location === "undefined" ? "" : location.search));
  const hovered = previewOverride<Params>();
  const previewed = (): Params => ({ ...committed(), ...hovered.value() });

  let host: HTMLElement | null = null;

  /**
   * A style is 180 KB, and somebody picks ONE.
   *
   * `import.meta.glob` gives Vite a chunk per file and this fetches only the
   * chosen one, so opening the page costs one style rather than eight. The
   * class goes on once the sheet is actually there, or the components spend a
   * frame with a style declared and not yet loaded.
   */
  const sheets = import.meta.glob("../../styles/*.css");
  const loaded = new Set<string>();

  const wearStyle = (name: string): void => {
    if (host === null) return;
    const element = host;
    const put = (): void => {
      for (const each of STYLES) {
        element.classList.toggle(`style-${each.value}`, each.value === name);
      }
    };
    if (name === NONE || loaded.has(name)) {
      put();
      return;
    }
    const load = sheets[`../../styles/${name}.css`];
    if (load === undefined) return;
    void load().then(() => {
      loaded.add(name);
      // The choice may have moved on while the sheet was in flight, and
      // applying a stale one here is what a race looks like from the outside.
      if (previewed().style === name) put();
    });
  };

  const apply = (): void => {
    const now = previewed();
    installTheme({ ...selectionOf(now), scope: PREVIEW_SCOPE });
    host?.classList.toggle("dark", now.dark);
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

  return {
    params: committed,
    previewed,
    set(next) {
      committed.set({ ...committed(), ...next });
      hovered.clear();
      writeUrl();
    },
    preview(next) {
      hovered.set(next);
    },
    clearPreview() {
      hovered.clear();
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
