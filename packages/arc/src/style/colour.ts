import { tokens } from "@barqjs/ui/theme/tokens";

import { arcLayer as arc } from "../layer.ts";

/** Text colour by role, on ui's tokens and arc's. */
export const fg = arc.create({
  default: { color: tokens.foreground },
  muted: { color: tokens.mutedForeground },
  faint: { color: "var(--faint-foreground)" },
  link: { color: "var(--link)" },
  danger: { color: tokens.destructive },
  inherit: { color: "inherit" },
  /** The foreground of the tone an ancestor chose with `tone.*`. */
  tone: { color: "var(--arc-tone-foreground)" },
  /** The tone itself, for a mark drawn in it: a dot, a line. */
  toneBase: { color: "var(--arc-tone)" },
  card: { color: tokens.cardForeground },
  popover: { color: tokens.popoverForeground },
});

/** Fill by role. */
export const bg = arc.create({
  page: { backgroundColor: tokens.background },
  card: { backgroundColor: tokens.card },
  popover: { backgroundColor: tokens.popover },
  sunken: { backgroundColor: "var(--sunken)" },
  muted: { backgroundColor: tokens.muted },
  transparent: { backgroundColor: "transparent" },
  /** The subtle fill of the tone an ancestor chose. */
  tone: { backgroundColor: "var(--arc-tone-subtle)" },
  toneSolid: { backgroundColor: "var(--arc-tone)" },
});

/**
 * A tone for everything under it: the three custom properties `fg.tone`,
 * `fg.toneBase` and `bg.tone` read, so a part picks a tone once and its
 * children draw in it.
 */
export const tone = arc.create({
  success: {
    "--arc-tone": "var(--success)",
    "--arc-tone-foreground": "var(--success-foreground)",
    "--arc-tone-subtle": "var(--success-subtle)",
  },
  warning: {
    "--arc-tone": "var(--warning)",
    "--arc-tone-foreground": "var(--warning-foreground)",
    "--arc-tone-subtle": "var(--warning-subtle)",
  },
  danger: {
    "--arc-tone": "var(--danger)",
    "--arc-tone-foreground": "var(--danger-foreground)",
    "--arc-tone-subtle": "var(--danger-subtle)",
  },
  info: {
    "--arc-tone": "var(--info)",
    "--arc-tone-foreground": "var(--info-foreground)",
    "--arc-tone-subtle": "var(--info-subtle)",
  },
  neutral: {
    "--arc-tone": "var(--neutral)",
    "--arc-tone-foreground": "var(--neutral-foreground)",
    "--arc-tone-subtle": "var(--neutral-subtle)",
  },
});
