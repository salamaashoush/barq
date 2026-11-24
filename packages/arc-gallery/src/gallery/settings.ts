import type { ArcThemeSelection, Density } from "@barqjs/arc";
import { useRouter, useSearchParams } from "@barqjs/router";

export type Direction = "ltr" | "rtl";
export type Viewport = "desktop" | "tablet" | "phone";

export interface Preset {
  readonly id: string;
  readonly label: string;
  readonly theme: ArcThemeSelection;
}

function accent(id: string, label: string): Preset {
  return {
    id,
    label,
    theme: { base: "neutral", accent: id },
  };
}

function base(id: string, label: string): Preset {
  return { id, label, theme: { base: id } };
}

/**
 * A brand on top of arc: the tokens an app sets for its own mark, light and
 * dark, read below as `var(--brand)` and laid over `primary` so every control
 * that takes the accent takes the brand.
 */
const ACME: Preset = {
  id: "acme",
  label: "Acme brand",
  theme: {
    base: "stone",
    radius: "0.875rem",
    tokens: {
      light: {
        brand: "oklch(0.56 0.17 38)",
        "brand-ink": "oklch(0.99 0 0)",
        primary: "oklch(0.56 0.17 38)",
        "primary-foreground": "oklch(0.99 0 0)",
        ring: "oklch(0.56 0.17 38)",
        link: "oklch(0.5 0.16 38)",
      },
      dark: {
        brand: "oklch(0.72 0.14 45)",
        "brand-ink": "oklch(0.2 0.02 40)",
        primary: "oklch(0.72 0.14 45)",
        "primary-foreground": "oklch(0.2 0.02 40)",
        ring: "oklch(0.72 0.14 45)",
        link: "oklch(0.78 0.12 45)",
      },
    },
  },
};

export interface PresetGroup {
  readonly label: string;
  readonly presets: readonly Preset[];
}

export const PRESET_GROUPS: readonly PresetGroup[] = [
  {
    label: "Base",
    presets: [
      base("neutral", "Neutral"),
      base("stone", "Stone"),
      base("zinc", "Zinc"),
      base("mauve", "Mauve"),
      base("olive", "Olive"),
      base("mist", "Mist"),
      base("taupe", "Taupe"),
    ],
  },
  {
    label: "Accent",
    presets: [
      accent("blue", "Blue"),
      accent("violet", "Violet"),
      accent("emerald", "Emerald"),
      accent("rose", "Rose"),
      accent("amber", "Amber"),
      accent("teal", "Teal"),
    ],
  },
  { label: "Brand", presets: [ACME] },
];

const PRESETS = PRESET_GROUPS.flatMap((group) => group.presets);

export const DENSITIES: readonly Density[] = ["compact", "comfortable", "spacious"];

export interface ViewportOption {
  readonly id: Viewport;
  readonly label: string;
  readonly width?: number;
}
export const VIEWPORTS: readonly ViewportOption[] = [
  { id: "desktop", label: "Desktop" },
  { id: "tablet", label: "Tablet", width: 820 },
  { id: "phone", label: "Phone", width: 390 },
];

export interface Settings {
  readonly preset: Preset;
  readonly density: Density;
  readonly dir: Direction;
  readonly contrast: boolean;
  readonly viewport: Viewport;
  /** The page inside the viewport frame, drawn without the shell. */
  readonly embedded: boolean;
}

function pick<T extends string>(value: string | null, options: readonly T[], fallback: T): T {
  return value !== null && (options as readonly string[]).includes(value) ? (value as T) : fallback;
}

export function readSettings(search: URLSearchParams): Settings {
  const preset = PRESETS.find((each) => each.id === search.get("theme")) ?? PRESETS[0]!;
  return {
    preset,
    density: pick(search.get("density"), DENSITIES, "comfortable"),
    dir: pick(search.get("dir"), ["ltr", "rtl"], "ltr"),
    contrast: search.get("contrast") === "high",
    viewport: pick(
      search.get("viewport"),
      VIEWPORTS.map((each) => each.id),
      "desktop",
    ),
    embedded: search.get("embed") === "1",
  };
}

export function localeOf(dir: Direction): string {
  return dir === "rtl" ? "ar-EG" : "en-US";
}

export interface SettingsApi {
  readonly settings: () => Settings;
  readonly set: (
    change: Partial<Record<"theme" | "density" | "dir" | "contrast" | "viewport", string>>,
  ) => void;
}

/**
 * The controls live in the query string, so a configuration is a link, the
 * server renders it on the first paint, and the viewport frame's page reads
 * the same values from its own address.
 */
export function useSettings(): SettingsApi {
  const [search] = useSearchParams();
  const router = useRouter();
  return {
    settings: () => readSettings(search()),
    set(change) {
      const next = new URLSearchParams(search());
      for (const [key, value] of Object.entries(change)) {
        if (value === undefined || value === "") next.delete(key);
        else next.set(key, value);
      }
      const { pathname, hash } = router.location();
      const query = next.toString();
      void router.navigate(`${pathname}${query === "" ? "" : `?${query}`}${hash}`, {
        replace: true,
        resetScroll: false,
      });
    },
  };
}
