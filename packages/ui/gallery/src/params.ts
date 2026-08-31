/**
 * The design system being configured, in the URL.
 *
 * shadcn's `/create` keeps its choices in the query string, and the reason is
 * not tidiness: it is what makes a configuration a LINK. Somebody picks a base,
 * an accent and a radius, copies the address bar, and the person who opens it
 * sees the same page. State in a signal alone cannot be sent to anyone.
 *
 * `replaceState` rather than `pushState`, because every picker would otherwise
 * put an entry in the history and Back would walk one token at a time.
 */

import { signal, type Accessor } from "@barqjs/core";
import { installTheme, type ThemeSelection } from "@barqjs/ui";

import { ACCENTS, BASES, CHARTS, FONTS, MONO, RADII, STYLES, type Option } from "./options.ts";

export interface Params {
  readonly style: string;
  readonly base: string;
  readonly accent: string;
  readonly chart: string;
  readonly radius: string;
  readonly font: string;
  readonly mono: string;
  readonly dark: boolean;
}

export const DEFAULTS: Params = {
  style: "none",
  base: "neutral",
  accent: "none",
  chart: "none",
  radius: "none",
  font: "system",
  mono: "system",
  dark: false,
};

/** `"none"` is a choice, so it needs a key; the selection turns it back into absence. */
export const NONE = "none";

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
    base: oneOf(BASES, query.get("base"), DEFAULTS.base),
    accent: oneOf(ACCENTS, query.get("accent"), DEFAULTS.accent),
    chart: oneOf(CHARTS, query.get("chart"), DEFAULTS.chart),
    radius: oneOf(RADII, query.get("radius"), DEFAULTS.radius),
    font: oneOf(FONTS, query.get("font"), DEFAULTS.font),
    mono: oneOf(MONO, query.get("mono"), DEFAULTS.mono),
    dark: query.get("dark") === "1",
  };
}

/** Only what differs from the default, so a shared link is short and readable. */
export function write(params: Params): string {
  const query = new URLSearchParams();
  for (const key of ["style", "base", "accent", "chart", "radius", "font", "mono"] as const) {
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
  const fonts = {
    ...(sans === undefined ? {} : { sans }),
    ...(mono === undefined ? {} : { mono }),
  };
  return {
    base: params.base,
    ...(params.accent === NONE ? {} : { accent: params.accent }),
    ...(params.chart === NONE ? {} : { chart: params.chart }),
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
    ["--theme", "base"],
    ["--accent", "accent"],
    ["--radius", "radius"],
  ] as const) {
    const value = params[key];
    if (value !== DEFAULTS[key] && value !== NONE) flags.push(`${flag} ${value}`);
  }
  return `bunx @barqjs/ui-cli init${flags.length === 0 ? "" : " "}${flags.join(" ")}`;
}

export interface Design {
  readonly params: Accessor<Params>;
  /** The committed choice, which goes in the URL. */
  set(next: Partial<Params>): void;
  /**
   * A choice being HOVERED, applied to the page and not to the URL.
   *
   * shadcn previews on hover for a reason worth keeping: choosing a colour
   * scheme is comparing, and a list you have to click through and undo is a
   * different task from one you sweep. Committing each hovered value to the URL
   * instead would push a history entry per item and make Back useless.
   */
  preview(next: Partial<Params> | null): void;
  reset(): void;
}

export function design(): Design {
  const committed = signal<Params>(read(typeof location === "undefined" ? "" : location.search));
  const hovered = signal<Partial<Params> | null>(null);

  const params = (): Params => ({ ...committed(), ...(hovered() ?? {}) });

  /**
   * A style is 180 KB, and somebody picks ONE.
   *
   * `import.meta.glob` gives Vite a chunk per file and this fetches only the
   * chosen one, so opening the page costs one style rather than eight. The
   * class goes on `<html>` once the sheet is actually there, or the components
   * spend a frame with a style declared and not yet loaded.
   */
  const sheets = import.meta.glob("../../styles/*.css");
  const loaded = new Set<string>();

  const wearStyle = (name: string): void => {
    if (typeof document === "undefined") return;
    if (name === NONE) {
      for (const each of STYLES) document.documentElement.classList.remove(`style-${each.value}`);
      return;
    }
    const put = (): void => {
      for (const each of STYLES) {
        document.documentElement.classList.toggle(`style-${each.value}`, each.value === name);
      }
    };
    if (loaded.has(name)) {
      put();
      return;
    }
    const load = sheets[`../../styles/${name}.css`];
    if (load === undefined) return;
    void load().then(() => {
      loaded.add(name);
      put();
    });
  };

  const apply = (): void => {
    const now = params();
    installTheme(selectionOf(now));
    if (typeof document !== "undefined") {
      document.documentElement.classList.toggle("dark", now.dark);
    }
    wearStyle(now.style);
  };

  return {
    params,
    set(next) {
      committed.set({ ...committed(), ...next });
      hovered.set(null);
      apply();
      if (typeof history !== "undefined") {
        history.replaceState(null, "", `${location.pathname}${write(committed())}`);
      }
    },
    preview(next) {
      hovered.set(next);
      apply();
    },
    reset() {
      committed.set(DEFAULTS);
      hovered.set(null);
      apply();
      if (typeof history !== "undefined") history.replaceState(null, "", location.pathname);
    },
  };
}
