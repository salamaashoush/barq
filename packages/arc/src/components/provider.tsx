import { type Child, Show, untrack } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { type ColorSchemeOptions, colorScheme } from "@barqjs/primitives/color-scheme";
import { Toaster, type ToasterProps } from "@barqjs/ui/sonner";

import { type ArcThemeSelection, installArcTheme } from "../theme/index.ts";
import { ConfirmHost } from "./confirm.tsx";

export interface ArcProviderProps {
  /** Installed when the provider renders, replacing any theme installed before. */
  theme?: ArcThemeSelection;
  /** Light, dark and system, right on the first paint; `false` when the app manages it. */
  colorScheme?: ColorSchemeOptions | false;
  /** The locale below, whose direction the components lay out in. Put the same `lang` and `dir` on `<html>`. */
  locale?: string;
  /** The toast stack's options, or `false` for none. */
  toaster?: Omit<ToasterProps, "theme"> | false;
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
  const theme = untrack(() => props.theme);
  if (theme !== undefined) installArcTheme(theme);
  const schemeOptions = untrack(() => props.colorScheme);
  const scheme = schemeOptions === false ? undefined : colorScheme(schemeOptions ?? {});
  const locale = untrack(() => props.locale);
  if (locale !== undefined) provideLocale(() => props.locale ?? locale);

  const toastTheme = (): "light" | "dark" | "system" => {
    if (scheme === undefined) return "system";
    if (scheme.choice() === "system") return "system";
    return scheme.resolved() === "dark" ? "dark" : "light";
  };

  return (
    <>
      {props.children}
      <Show when={props.toaster !== false}>
        <Toaster {...(props.toaster === false ? {} : props.toaster)} theme={toastTheme()} />
      </Show>
      <ConfirmHost />
    </>
  );
}
