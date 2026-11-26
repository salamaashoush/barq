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
import { type ReaderClock, provideReaderClock } from "../lib/reader-clock.ts";
import { linkRouter, maybeRouter } from "./link.ts";
import { type ArcMessages, provideArcMessages } from "./messages.ts";
import { ModalHost, type ModalHostProps } from "./modals.tsx";

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
  /**
   * How the reader reads times: their zone or UTC, a 12- or 24-hour clock,
   * the first day of a week. Every time and calendar arc draws follows it.
   */
  clock?: ReaderClock;
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
  /** `classes` for the loading and failed dialogs of `openModal()`. */
  modals?: ModalHostProps;
  children?: Child;
}

/**
 * What a page built on arc needs once, near its root: the theme, the colour
 * scheme, the locale, the toast stack, and the hosts `confirm()` and
 * `openModal()` draw in.
 *
 * ```tsx
 * <ArcProvider theme={{ base: "neutral", accent: "blue" }} locale="ar">
 *   <App />
 * </ArcProvider>
 * ```
 */
export function ArcProvider(props: ArcProviderProps) {
  function look(): Look {
    return {
      theme: props.theme,
      density: props.density,
      contrast: props.contrast,
    };
  }
  // During render, so a server's inlined sheet carries it, and again whenever
  // a prop changes, so a theme picker reaches the page without a remount.
  install(untrack(look));
  createEffect(look, install);
  provideArcMessages(() => props.messages);
  const schemeOptions = untrack(() => props.colorScheme);
  const scheme = schemeOptions === false ? undefined : colorScheme(schemeOptions ?? {});
  const locale = untrack(() => props.locale);
  if (untrack(() => props.clock) !== undefined) {
    provideReaderClock(
      () => props.clock,
      locale === undefined ? undefined : () => props.locale ?? locale,
    );
  } else if (locale !== undefined) provideLocale(() => props.locale ?? locale);

  function toastTheme(): "light" | "dark" | "system" {
    if (scheme === undefined) return "system";
    if (scheme.choice() === "system") return "system";
    return scheme.resolved() === "dark" ? "dark" : "light";
  }

  // An `href` on any of ui's or arc's links goes through the app's router,
  // when there is one, instead of loading the page again.
  const router = linkRouter(maybeRouter());
  function children(): Child {
    return router === undefined
      ? props.children
      : provide(
          RouterContext,
          () => router,
          () => props.children,
        );
  }

  return (
    <>
      {children()}
      <Show when={props.toaster !== false}>
        <Toaster {...(props.toaster === false ? {} : props.toaster)} theme={toastTheme()} />
      </Show>
      <ConfirmHost {...props.confirm} />
      <ModalHost {...props.modals} />
    </>
  );
}
