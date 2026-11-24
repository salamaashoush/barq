import { type Child, Show, createEffect, provide, untrack } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { RouterContext } from "@barqjs/aria/interactions";
import { type ColorSchemeOptions, colorScheme } from "@barqjs/primitives/color-scheme";
import { Toaster, type ToasterProps } from "@barqjs/ui/sonner";

import {
  type ArcThemeSelection,
  type Density,
  installArcDensity,
  installArcTheme,
} from "../theme/index.ts";
import { ConfirmHost, type ConfirmHostProps } from "./confirm.tsx";
import { linkRouter, maybeRouter } from "./link.ts";
import { type ArcMessages, provideArcMessages } from "./messages.ts";

interface Look {
  readonly theme: ArcThemeSelection | undefined;
  readonly density: Density | undefined;
  readonly contrast: "high" | "system" | undefined;
}

function install({ theme, density, contrast }: Look): void {
  if (theme !== undefined) {
    installArcTheme({
      ...theme,
      ...(density === undefined ? {} : { density }),
      ...(contrast === undefined ? {} : { contrast }),
    });
  } else if (density !== undefined) {
    installArcDensity(density);
  }
}

export interface ArcProviderProps {
  /** Installed when the provider renders and whenever it changes, replacing any theme installed before. */
  theme?: ArcThemeSelection;
  /** Light, dark and system, right on the first paint; `false` when the app manages it. */
  colorScheme?: ColorSchemeOptions | false;
  /** The locale below, whose direction the components lay out in. Put the same `lang` and `dir` on `<html>`. */
  locale?: string;
  /** The toast stack's options, or `false` for none. */
  toaster?: Omit<ToasterProps, "theme"> | false;
  /**
   * The room the page takes, over the theme's: `compact`, `comfortable` or
   * `spacious`. A region takes another with `data-density` on any element.
   */
  density?: Density;
  /** The high-contrast tokens, always or while the system asks for more contrast. */
  contrast?: "high" | "system";
  /** arc's own words, over English: what a copy button says, a table's page labels. */
  messages?: Partial<ArcMessages>;
  /** `classes` for the dialog `confirm()` draws. */
  confirm?: ConfirmHostProps;
  children?: Child;
}

/**
 * What a page built on arc needs once, near its root: the theme, the colour
 * scheme, the locale, the toast stack and the host `confirm()` draws in.
 *
 * ```tsx
 * <ArcProvider theme={{ base: "neutral", accent: "blue" }} locale="ar">
 *   <App />
 * </ArcProvider>
 * ```
 */
export function ArcProvider(props: ArcProviderProps) {
  const look = (): Look => ({
    theme: props.theme,
    density: props.density,
    contrast: props.contrast,
  });
  // During render, so a server's inlined sheet carries it, and again whenever
  // a prop changes, so a theme picker reaches the page without a remount.
  install(untrack(look));
  createEffect(look, install);
  provideArcMessages(() => props.messages);
  const schemeOptions = untrack(() => props.colorScheme);
  const scheme = schemeOptions === false ? undefined : colorScheme(schemeOptions ?? {});
  const locale = untrack(() => props.locale);
  if (locale !== undefined) provideLocale(() => props.locale ?? locale);

  const toastTheme = (): "light" | "dark" | "system" => {
    if (scheme === undefined) return "system";
    if (scheme.choice() === "system") return "system";
    return scheme.resolved() === "dark" ? "dark" : "light";
  };

  // An `href` on any of ui's or arc's links goes through the app's router,
  // when there is one, instead of loading the page again.
  const router = linkRouter(maybeRouter());
  const children = (): Child =>
    router === undefined
      ? props.children
      : provide(
          RouterContext,
          () => router,
          () => props.children,
        );

  return (
    <>
      {children()}
      <Show when={props.toaster !== false}>
        <Toaster {...(props.toaster === false ? {} : props.toaster)} theme={toastTheme()} />
      </Show>
      <ConfirmHost {...props.confirm} />
    </>
  );
}
